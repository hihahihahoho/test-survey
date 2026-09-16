#!/usr/bin/env python3
"""Chạy `slice.py` + `validate_output_geometry.py` THẬT trên mỗi ca staging và đổ
nguyên đầu ra vào thư mục fixture. Dev-only; xem `make-golden-slice.sh`.

Chạy: python3 run-golden.py <staging> <đích> <kit-gen-root>
"""
import json, os, shutil, subprocess, sys


def main():
    stage, out, root = sys.argv[1], sys.argv[2], sys.argv[3]
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out, exist_ok=True)
    names = sorted(n for n in os.listdir(stage) if os.path.isdir(os.path.join(stage, n)))
    for name in names:
        cdir = os.path.join(stage, name)
        dst = os.path.join(out, name)
        print("──", name)
        for f in ("slice.py", "geometry.py"):
            shutil.copy(os.path.join(root, f), os.path.join(cdir, f))
        has_contract = os.path.exists(os.path.join(cdir, "contract.json"))
        if has_contract:
            shutil.copy(os.path.join(root, "validate_output_geometry.py"), cdir)

        os.makedirs(os.path.join(dst, "expected"), exist_ok=True)
        shutil.copytree(os.path.join(cdir, "raw"), os.path.join(dst, "raw"))
        for f in ("styles.json", "steps.json", "contract.json", "validate-jobs.json"):
            p = os.path.join(cdir, f)
            if os.path.exists(p):
                shutil.copy(p, os.path.join(dst, f))

        steps = json.load(open(os.path.join(cdir, "steps.json")))
        for i, argv in enumerate(steps):
            p = subprocess.run([sys.executable, "slice.py", *argv], cwd=cdir,
                               capture_output=True, text=True)
            base = os.path.join(dst, "expected", "step-%d" % i)
            open(base + ".stdout.txt", "w", encoding="utf-8").write(p.stdout)
            open(base + ".exit.txt", "w").write("%d\n" % p.returncode)
            if p.stderr.strip():
                open(base + ".stderr.txt", "w", encoding="utf-8").write(p.stderr)
            mpath = os.path.join(cdir, "kits", "manifest.json")
            if os.path.exists(mpath):
                shutil.copy(mpath, base + ".manifest.json")
            print("   lượt %d: argv=%s exit=%d" % (i, argv, p.returncode))

        kits = os.path.join(cdir, "kits")
        if os.path.isdir(kits):
            ek = os.path.join(dst, "expected", "kits")
            for dirpath, _dirs, files in os.walk(kits):
                for f in files:
                    if not f.endswith(".png"):
                        continue
                    rel = os.path.relpath(os.path.join(dirpath, f), kits)
                    tgt = os.path.join(ek, rel)
                    os.makedirs(os.path.dirname(tgt), exist_ok=True)
                    shutil.copy(os.path.join(dirpath, f), tgt)

        jobs_path = os.path.join(cdir, "validate-jobs.json")
        if os.path.exists(jobs_path):
            vdir = os.path.join(dst, "expected", "validate")
            os.makedirs(vdir, exist_ok=True)
            for job in json.load(open(jobs_path)):
                p = subprocess.run(
                    [sys.executable, "validate_output_geometry.py", "--image",
                     os.path.join("raw", job + ".png"), "--contract", "contract.json",
                     "--job", job], cwd=cdir, capture_output=True, text=True)
                open(os.path.join(vdir, job + ".json"), "w", encoding="utf-8").write(p.stdout)
                open(os.path.join(vdir, job + ".exit.txt"), "w").write("%d\n" % p.returncode)
                print("   validate %s: exit=%d" % (job, p.returncode))
    print("xong:", len(names), "ca")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
