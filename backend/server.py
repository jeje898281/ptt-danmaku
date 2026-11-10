#!/usr/bin/env python3
"""PTT 彈幕後端:用 PyPtt 直連 wss://ws.ptt.cc 抓指定文章的最新推文,
透過本機 WebSocket (ws://127.0.0.1:9737) 廣播給彈幕 overlay 與控制面板。"""

import asyncio
import json
import threading
import time
import traceback
from dataclasses import dataclass, field

import websockets

HOST = "127.0.0.1"
PORT = 9737
POLL_INTERVAL = 2.0          # 每輪輪詢之間的間隔(秒)
BACKLOG_ON_ADD = 5           # 新增文章時先送出最近幾則推文當回饋

PALETTE = ["#4fc3f7", "#ffb74d", "#aed581", "#f06292", "#ba68c8", "#fff176"]

COMMENT_TYPE_SYMBOL = {"PUSH": "推", "BOO": "噓", "ARROW": "→"}


@dataclass
class Article:
    url: str
    board: str
    aid: str
    color: str
    title: str = ""
    seen: int = -1  # 已送出的推文數;-1 表示還沒抓過第一次
    errors: int = 0


class Hub:
    """asyncio 端:管理 WebSocket 連線與廣播。"""

    def __init__(self):
        self.clients: set = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    async def register(self, ws):
        self.clients.add(ws)

    async def unregister(self, ws):
        self.clients.discard(ws)

    def broadcast(self, msg: dict):
        """執行緒安全:PyPtt worker 執行緒也可以呼叫。"""
        data = json.dumps(msg, ensure_ascii=False)
        if self.loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._send_all(data), self.loop)

    async def _send_all(self, data: str):
        dead = []
        for ws in self.clients:
            try:
                await ws.send(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


class PttWorker(threading.Thread):
    """PyPtt 是同步 API,放在獨立執行緒跑登入與輪詢。"""

    def __init__(self, hub: Hub):
        super().__init__(daemon=True)
        self.hub = hub
        self.cmd_q: "list[dict]" = []
        self.cmd_lock = threading.Lock()
        self.articles: dict[str, Article] = {}
        self.bot = None
        self.logged_in = False
        self.stop_flag = False
        self.last_status: dict | None = None

    # ---- 從 asyncio 端丟命令進來 ----
    def submit(self, cmd: dict):
        with self.cmd_lock:
            self.cmd_q.append(cmd)

    def _drain_cmds(self):
        with self.cmd_lock:
            cmds, self.cmd_q = self.cmd_q, []
        return cmds

    def status(self, state: str, message: str = ""):
        msg = {"type": "status", "state": state, "message": message,
               "logged_in": self.logged_in,
               "articles": [self._article_info(a) for a in self.articles.values()]}
        self.last_status = msg
        self.hub.broadcast(msg)

    @staticmethod
    def _article_info(a: Article):
        return {"url": a.url, "board": a.board, "aid": a.aid,
                "title": a.title, "color": a.color, "seen": max(a.seen, 0)}

    # ---- 命令處理 ----
    def _login(self, ptt_id: str, ptt_pw: str, kick: bool):
        import PyPtt
        from PyPtt import exceptions as pex
        self.status("logging_in", "登入 PTT 中…(通常需要 10~30 秒)")
        try:
            if self.bot is not None:
                try:
                    self.bot.logout()
                except Exception:
                    pass
            self.bot = PyPtt.API()
            self.bot.login(ptt_id, ptt_pw, kick_other_session=kick)
            self.logged_in = True
            self.status("ready", f"已登入 PTT({ptt_id})")
        except (pex.WrongIDorPassword, pex.WrongPassword):
            self._login_failed("帳號或密碼錯誤")
        except pex.LoginTooOften:
            self._login_failed("登入太頻繁,PTT 要求稍等幾分鐘再試")
        except pex.UnregisteredUser:
            self._login_failed("這個帳號尚未完成註冊認證,無法使用")
        except (pex.ConnectError, pex.ConnectionClosed):
            self._login_failed("連不上 PTT 伺服器(ws.ptt.cc),請檢查網路")
        except Exception as e:
            # 印出 PTT 最後停留的畫面(不含密碼),方便判斷卡在哪一步
            try:
                screen = self.bot.connect_core.get_screen_queue()[-1]
                print("---- 登入失敗時的 PTT 畫面 ----\n" + screen + "\n------------------------", flush=True)
            except Exception:
                screen = ""
            hint = next((line.strip() for line in screen.splitlines() if line.strip()), "")
            self._login_failed(f"{type(e).__name__}: {e}" + (f"(PTT 畫面:{hint[:60]})" if hint else ""))

    def _login_failed(self, reason: str):
        self.bot = None
        self.logged_in = False
        self.status("error", f"登入失敗:{reason}")

    def _add_article(self, url: str):
        if not self.logged_in:
            self.status("error", "請先登入 PTT 再加文章")
            return
        url = url.strip()
        if url in self.articles:
            self.status("ready", "這篇文章已經在清單裡了")
            return
        try:
            board, aid = self.bot.get_aid_from_url(url)
        except Exception as e:
            self.status("error", f"無法解析文章網址:{e}")
            return
        color = PALETTE[len(self.articles) % len(PALETTE)]
        art = Article(url=url, board=board, aid=aid, color=color)
        try:
            self._poll_article(art, first=True)
        except Exception as e:
            self.status("error", f"抓取文章失敗:{e}")
            return
        self.articles[url] = art
        self.status("ready", f"已加入:{art.title or url}")

    def _remove_article(self, url: str):
        if self.articles.pop(url.strip(), None) is not None:
            self.status("ready", "已移除文章")

    # ---- 輪詢 ----
    def _poll_article(self, art: Article, first: bool = False):
        import PyPtt
        post = self.bot.get_post(art.board, aid=art.aid)
        if not post:
            raise RuntimeError("文章不存在或已被刪除")
        art.title = post.get(PyPtt.PostField.title) or art.title
        comments = post.get(PyPtt.PostField.comments) or []
        total = len(comments)

        if first or art.seen < 0:
            start = max(0, total - BACKLOG_ON_ADD)
            backlog = True
        elif total < art.seen:  # 文章被砍推文重算,重設基準
            art.seen = total
            return
        else:
            start = art.seen
            backlog = False

        for c in comments[start:total]:
            ctype = c.get(PyPtt.CommentField.type)
            name = getattr(ctype, "name", str(ctype))
            self.hub.broadcast({
                "type": "comment",
                "url": art.url,
                "board": art.board,
                "title": art.title,
                "color": art.color,
                "ctype": COMMENT_TYPE_SYMBOL.get(name, "→"),
                "user": c.get(PyPtt.CommentField.author, ""),
                "content": (c.get(PyPtt.CommentField.content) or "").strip(),
                "time": c.get(PyPtt.CommentField.time, ""),
                "backlog": backlog,
            })
        art.seen = total
        art.errors = 0

    def run(self):
        self.status("idle", "後端已啟動,等待登入")
        while not self.stop_flag:
            for cmd in self._drain_cmds():
                try:
                    t = cmd.get("type")
                    if t == "login":
                        self._login(cmd["id"], cmd["pw"], cmd.get("kick", True))
                    elif t == "add_article":
                        self._add_article(cmd["url"])
                    elif t == "remove_article":
                        self._remove_article(cmd["url"])
                    elif t == "get_status":
                        self.status("ready" if self.logged_in else "idle")
                except Exception as e:
                    traceback.print_exc()
                    self.status("error", f"指令執行失敗:{e}")

            if self.logged_in and self.articles:
                for art in list(self.articles.values()):
                    try:
                        self._poll_article(art)
                    except Exception as e:
                        art.errors += 1
                        if art.errors >= 5:
                            self.articles.pop(art.url, None)
                            self.status("error",
                                        f"「{art.title or art.url}」連續抓取失敗,已移除:{e}")
                time.sleep(POLL_INTERVAL)
            else:
                time.sleep(0.3)

        if self.bot is not None:
            try:
                self.bot.logout()
            except Exception:
                pass


DEMO_LINES = [
    ("推", "tennisfan", "這球太扯了吧!!!"),
    ("推", "acefans", "Alcaraz 正拍尾勁有夠噁"),
    ("噓", "badcall", "這顆明明出界 鷹眼勒"),
    ("→", "watcher99", "第三盤要開始了"),
    ("推", "netking", "上網截擊漂亮"),
    ("推", "gostraight", "ACE!!!!!"),
    ("→", "lurker", "有人有高畫質連結嗎"),
    ("推", "slicelover", "這切球角度太刁鑽"),
]


async def demo(hub: Hub):
    for i, (ctype, user, content) in enumerate(DEMO_LINES):
        hub.broadcast({"type": "comment", "url": "demo", "board": "Tennis",
                       "title": "[LIVE] 測試彈幕", "color": PALETTE[i % 2],
                       "ctype": ctype, "user": user, "content": content,
                       "time": "", "backlog": False})
        await asyncio.sleep(0.7)


async def main():
    hub = Hub()
    hub.loop = asyncio.get_running_loop()
    worker = PttWorker(hub)
    worker.start()

    async def handler(ws):
        await hub.register(ws)
        try:
            # 一連上就先把最後已知狀態送過去,UI 不用等 worker 回應
            if worker.last_status is not None:
                await ws.send(json.dumps(worker.last_status, ensure_ascii=False))
            worker.submit({"type": "get_status"})
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                t = msg.get("type")
                if t == "ping":
                    # 心跳直接由 asyncio 端回,就算 worker 正忙著登入也能回應
                    await ws.send(json.dumps({"type": "pong"}))
                elif t in ("login", "add_article", "remove_article", "get_status"):
                    worker.submit(msg)
                elif t == "settings":
                    hub.broadcast(msg)  # 控制面板 → overlay 的設定直接轉播
                elif t == "demo":
                    asyncio.create_task(demo(hub))
        except websockets.exceptions.ConnectionClosed:
            pass  # 客戶端關閉連線是正常情況,不用印 traceback
        finally:
            await hub.unregister(ws)

    try:
        server = await websockets.serve(handler, HOST, PORT)
    except OSError:
        print(f"錯誤:{PORT} 埠已被占用,可能已經有另一個 ptt-danmaku 在跑了")
        raise SystemExit(48)
    async with server:
        print(f"PTT danmaku backend on ws://{HOST}:{PORT}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
