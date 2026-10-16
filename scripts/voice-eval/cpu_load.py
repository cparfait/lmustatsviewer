"""Charge CPU simulant le jeu : N processus en boucle active pendant T secondes.

Usage : python -I cpu_load.py <N> <secondes>
"""

import multiprocessing as mp
import sys
import time


def burn(until):
    x = 0
    while time.time() < until:
        x = (x * 1103515245 + 12345) & 0xFFFFFFFF


if __name__ == "__main__":
    n, secs = int(sys.argv[1]), float(sys.argv[2])
    until = time.time() + secs
    procs = [mp.Process(target=burn, args=(until,)) for _ in range(n)]
    for p in procs:
        p.start()
    for p in procs:
        p.join()
