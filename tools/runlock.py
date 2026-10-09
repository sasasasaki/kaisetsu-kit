# One heavy browser job at a time on this machine (full renders, full-film layout QC): <repo>/.render.lock holds "<pid> <tag>".
# Taken in one step with O_CREAT|O_EXCL: two queued jobs that both saw the lock disappear once started rendering together and froze
# the machine. A lock whose process is gone is stale and is removed before retrying.
import os, sys, time, subprocess
from contextlib import contextmanager
from kit import REPO

LOCK = REPO / '.render.lock'


def _alive(pid):
    if sys.platform == 'win32':
        return str(pid) in subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/NH'], capture_output=True, text=True).stdout
    try:
        os.kill(pid, 0); return True
    except OSError:
        return False


@contextmanager
def heavy(tag):
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f'{os.getpid()} {tag}'.encode()); os.close(fd)
            break
        except FileExistsError:
            try:
                held = LOCK.read_text().strip(); pid = int(held.split()[0])
            except (OSError, ValueError, IndexError):
                time.sleep(1); continue
            if not _alive(pid):
                LOCK.unlink(missing_ok=True); continue
            print('waiting for lock held by', held, flush=True); time.sleep(30)
    try:
        yield
    finally:
        LOCK.unlink(missing_ok=True)
