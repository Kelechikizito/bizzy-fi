# Prints a file's SHA-256 in base58, the form NEAR uses for code hashes.
import hashlib
import sys

b = hashlib.sha256(open(sys.argv[1], "rb").read()).digest()
n, s, a = int.from_bytes(b, "big"), "", "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
while n:
    n, r = divmod(n, 58)
    s = a[r] + s
print("1" * (len(b) - len(b.lstrip(b"\0"))) + s)
