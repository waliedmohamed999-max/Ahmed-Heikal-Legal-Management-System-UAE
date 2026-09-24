from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
p = root / 'prisma/schema.prisma'
s = p.read_text(encoding='utf-8')
s = re.sub(r'  previewFeatures = .*\n', '', s)
s = s.replace('provider   = "postgresql"', 'provider   = "mysql"')
s = re.sub(r'  extensions = .*\n', '', s).replace('@db.Uuid', '@db.Char(36)')
s = re.sub(r'(\w+\s+)(?:String|Int)\[\](\s*)(@default\(\[.*?\]\))?', lambda m: m[1] + 'Json' + m[2] + ('@default("[\\"IN_APP\\"]")' if 'IN_APP' in m[0] else '@default("[]")'), s)
# Preserve PostgreSQL's unbounded text semantics for non-indexed strings.
def model(match):
    block = match[0]
    indexed = set()
    for fields in re.findall(r'@@(?:index|unique|id)\(\[([^]]+)\]', block):
        indexed.update(re.findall(r'\b\w+\b', fields))
    lines = []
    for line in block.splitlines():
        f = re.match(r'\s+(\w+)\s+String\??\b', line)
        if f and '@db.' not in line:
            if f[1] in indexed or '@unique' in line or '@id' in line or '@default(' in line or f[1] == 'permissionKey':
                native = '@db.VarChar(191)'
            else:
                native = '@db.LongText'
            code, sep, comment = line.partition('//')
            line = code.rstrip() + ' ' + native + (' //' + comment if sep else '')
        lines.append(line)
    return '\n'.join(lines)
s = re.sub(r'model \w+ \{.*?\n\}', model, s, flags=re.S)
p.write_text(s, encoding='utf-8')
for p in (root/'src').rglob('*.ts*'):
    s = p.read_text(encoding='utf-8')
    new = re.sub(r', mode: "insensitive"(?: as const)?', '', s)
    new = re.sub(r'tags: \{ has: ([^}]+)\}', r'tags: { array_contains: \1}', new)
    if new != s: p.write_text(new, encoding='utf-8')
