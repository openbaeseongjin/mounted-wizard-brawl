# 「마상 마법 난투」 데모를 친구에게 보내기 쉬운 HTML 파일 하나로 묶는다.
# 우리 모듈 16개와 녹음 소리(sfx/*.mp3, base64)를 파일 안에 넣는다. three.js와 Rapier는 jsDelivr에서 받으므로 인터넷이 필요하다.
# 사용: python build_share.py  -> ../../mw-play.html (프로젝트 폴더, 카톡용) + ../share/mw-play-artifact.html (웹 링크용)
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
read = lambda *p: open(os.path.join(HERE, *p), encoding='utf-8').read()

# 의존 순서 (앞 모듈이 뒤 모듈을 쓰지 않게)
ORDER = ['config', 'rng', 'fighter', 'spells', 'ai', 'assist', 'match', 'gauntlet', 'models', 'scene', 'fx', 'view', 'viewport', 'hud', 'input', 'audio']
OURS = re.compile(r"^import \{([^}]*)\} from '\./(\w+)\.js';\s*$", re.M)
THREE = "import * as THREE from 'three';"

def convert(src):
    """우리 모듈 import → 앞에서 만든 묶음에서 꺼내기, three import 줄은 지운다"""
    src = src.replace(THREE + '\n', '').replace(THREE, '')
    assert not re.search(r"^import .* from '(?!\./)", src, re.M), 'unexpected import'
    return OURS.sub(lambda m: f"const {{{m.group(1)}}} = __{m.group(2)};", src)

parts = []
for name in ORDER:
    body = convert(read(name + '.js'))
    names = re.findall(r'^export (?:async )?(?:function|const|let|class) (\w+)', body, re.M)
    body = re.sub(r'^export ', '', body, flags=re.M)
    assert 'export ' not in re.sub(r'//.*', '', body), name
    parts.append(f"// ----- {name}.js -----\nconst __{name} = (() => {{\n{body}\nreturn {{ {', '.join(names)} }};\n}})();\n")
main = convert(read('main.js'))
bundle = THREE + '\n' + '\n'.join(parts) + '// ----- main.js -----\n' + main

# 녹음 소리(sfx/*.mp3)는 base64로 넣는다. audio.js가 window.__SFX가 있으면 파일 대신 이것을 쓴다
import base64, json
sfx = {}
for f in sorted(os.listdir(os.path.join(HERE, 'sfx'))):
    if f.endswith('.mp3'):
        sfx[f[:-4]] = base64.b64encode(open(os.path.join(HERE, 'sfx', f), 'rb').read()).decode('ascii')
sfx_tag = '<script>window.__SFX = ' + json.dumps(sfx, separators=(',', ':')) + ';</script>\n'

html = read('index.html')
tag = '<script type="module" src="./main.js"></script>'
assert tag in html
html = html.replace(tag, sfx_tag + '<script type="module">\n' + bundle.replace('</script>', '<\\/script>') + '</script>')

out1 = os.path.join(ROOT, 'mw-play.html')
open(out1, 'w', encoding='utf-8').write(html)
print(out1, round(os.path.getsize(out1) / 1024), 'KB')

# 웹 링크(Artifact)용: 바깥 틀(doctype/html/head/body)과 charset·viewport 메타는 게시할 때 씌워지므로 뺀다. <title>은 맨 앞으로
art = html
for t in ['<!doctype html>', '<html lang="ko">', '<head>', '</head>', '<body>', '</body>', '</html>', '<meta charset="UTF-8"/>',
          '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>']:
    assert t in art, t
    art = art.replace(t, '', 1)
title = re.search(r'<title>.*?</title>\n?', art).group(0)
art = '<title>마상 마법 난투</title>\n' + art.replace(title, '', 1).strip() + '\n'
os.makedirs(os.path.join(ROOT, 'docs', 'share'), exist_ok=True)
out2 = os.path.join(ROOT, 'docs', 'share', 'mw-play-artifact.html')
open(out2, 'w', encoding='utf-8').write(art)
print(out2, round(os.path.getsize(out2) / 1024), 'KB')
