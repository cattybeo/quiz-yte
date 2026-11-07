import re, json, sys

src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding="utf-8").read().split("\n")

TITLES = {
    1: "Đại cương về hệ thống y tế và tổ chức mạng lưới y tế Việt Nam",
    2: "Quản lý, quản lý y tế, kỹ năng quản lý",
    3: "Tổ chức và quản lý bệnh viện",
    4: "Thông tin, quản lý thông tin y tế",
    5: "Quản lý nhân lực",
    6: "Quản lý tài chính và vật tư y tế",
    7: "Phân tích và xác định vấn đề sức khỏe, vấn đề sức khỏe ưu tiên",
    8: "Lập kế hoạch y tế",
    9: "Điều hành và giám sát hoạt động y tế",
    10: "Đánh giá chương trình, kế hoạch hoạt động y tế",
}

re_header = re.compile(r"^B[ÀA]I\s*(\d+)\b", re.I)
re_q = re.compile(r"^(\d+)\.\s*(\S.*)$")
re_opt = re.compile(r"^([A-F])\.\s*(.*)$")
re_ans = re.compile(r"^Đáp án ([A-F])\.")

lessons, cur, q = [], None, None
state = "none"  # header | question | option | note


def clean(s):
    s = s.replace("#", "")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s*:\s*$", ":", s)
    return s


def close_q():
    global q
    if q is not None:
        cur["questions"].append(q)
    q = None


for raw in lines[1:]:
    line = raw.strip()
    if not line or re.fullmatch(r"\d+", line):
        continue
    m = re_header.match(line)
    if m and "›" not in line and state in ("note", "none"):
        close_q()
        n = int(m.group(1))
        cur = {"id": n, "title": TITLES[n], "questions": []}
        lessons.append(cur)
        state = "header"
        continue
    if state == "header":
        if re_q.match(line):
            pass
        else:
            continue  # title lines
    m = re_ans.match(line)
    if m:
        q["answer"] = m.group(1)
        state = "note"
        continue
    m = re_q.match(line)
    if m and state in ("header", "note"):
        close_q()
        q = {"q": m.group(2), "options": [], "answer": None}
        state = "question"
        continue
    if state == "note":
        continue
    m = re_opt.match(line)
    if m and state in ("question", "option"):
        q["options"].append(m.group(2))
        state = "option"
        continue
    if state == "question":
        q["q"] += " " + line
    elif state == "option":
        q["options"][-1] += " " + line
close_q()

# Known source typo: Bài 5 câu 2, option B contains a stray "C. Tạo sự thân mật"
for les in lessons:
    for qq in les["questions"]:
        qq["options"] = [re.sub(r"C\. Tạo sự thân mật$", "", clean(o)).strip().rstrip(":").strip() for o in qq["options"]]
        qq["q"] = clean(qq["q"])

# Validate + convert answer letter to index
problems = []
for les in lessons:
    for i, qq in enumerate(les["questions"]):
        letters = "ABCDEF"[: len(qq["options"])]
        if qq["answer"] not in letters or len(qq["options"]) < 2:
            problems.append((les["id"], i + 1, qq))
        qq["answer"] = letters.index(qq["answer"])

for p in problems:
    print("PROBLEM", p)
for les in lessons:
    print(les["id"], len(les["questions"]), [len(x["options"]) for x in les["questions"]])
print("total", sum(len(l["questions"]) for l in lessons))

with open(out, "w", encoding="utf-8") as f:
    f.write("// Auto-generated from questionnaire_dap_an.pdf\n")
    f.write("window.QUIZ_DATA = ")
    json.dump(lessons, f, ensure_ascii=False, indent=1)
    f.write(";\n")
