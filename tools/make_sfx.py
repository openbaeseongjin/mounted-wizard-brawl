# 녹음 소리 원본에서 게임용 짧은 mp3를 잘라 만든다 → ../sfx/<이름>_<번호>.mp3
# 원본은 저장소에 넣지 않는다. 받는 곳·라이선스는 ../sfx/CREDITS.md
#   Kenney Impact Sounds (CC0)  https://kenney.nl/assets/impact-sounds
#   congusbongus 말발굽 (CC-BY 4.0, 원본 CC0)  https://opengameart.org/node/167525
#   HaelDB Male Grunt/Yelling (CC0)  https://opengameart.org/content/male-gruntyelling-sounds
#   Briefer 외 2015 말 울음 (CC BY 4.0)  https://commons.wikimedia.org/wiki/File:Segregation-of-information-about-emotional-arousal-and-valence-in-horse-whinnies-srep09989-s2.oga
# 사용: python tools/make_sfx.py <받은 폴더>   (폴더 안: kenney_impact/Audio, gallop, "yell/yelling sounds", whinny/whinny.oga)
# 필요: ffmpeg, numpy
import os, sys, subprocess, numpy as np

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'sfx')
os.makedirs(OUT, exist_ok=True)
K = lambda n: os.path.join(SRC, 'kenney_impact', 'Audio', n + '.ogg')
Y = lambda n: os.path.join(SRC, 'yell', 'yelling sounds', n + '.wav')
G = lambda n: os.path.join(SRC, 'gallop', n + '.mp3')
W = os.path.join(SRC, 'whinny', 'whinny.oga')

# 이름: [(파일, 시작초, 길이초 또는 None)]. 목소리 구간은 소리 세기로 찾은 자리(앞 30ms, 뒤 120ms 여유)
def seg(a, b): return (a / 1000 - 0.03, (b - a) / 1000 + 0.15)
SETS = {
    'hitBody':  [(K('impactPunch_heavy_00%d' % i), 0, None) for i in (0, 1, 2)],
    'hitWood':  [(K('impactWood_heavy_00%d' % i), 0, None) for i in (0, 1, 3)],
    'hitMetal': [(K('impactMetal_heavy_00%d' % i), 0, None) for i in (0, 1, 2)],
    'clackWood': [(K('impactWood_medium_00%d' % i), 0, None) for i in (0, 1, 2)],
    'clankMetal': [(K('impactPlate_heavy_00%d' % i), 0, None) for i in (0, 1, 2)],
    'thud':     [(K('impactSoft_heavy_00%d' % i), 0, None) for i in (0, 1, 2)],
    'prop':     [(K('impactPlank_medium_00%d' % i), 0, None) for i in (0, 1)],
    'kick':     [(K('impactPunch_medium_00%d' % i), 0, None) for i in (0, 1)],
    'rattle':   [(K('impactWood_light_00%d' % i), 0, None) for i in (0, 1, 2)],
    'hoofGallop': [(G('ground'), 0, None), (G('grass'), 0, None)],
    'hoofTrot': [(G('muffled'), 0, None)],
    'neigh':    [(W, 0.15, 1.85), (W, 3.95, 2.05)],
    # 목소리 세 묶음: 낮은(묵직이·대장), 중간, 높은. 기합(grunt)은 짧고 비명(cry)은 길다
    'gruntLow': [(Y('yell12'), *seg(240, 680)), (Y('yell7'), *seg(200, 760)), (Y('yell13'), *seg(340, 760))],
    'cryLow':   [(Y('yell2'), *seg(340, 1620)), (Y('yell5'), *seg(440, 1600)), (Y('yell4'), *seg(480, 1480))],
    'gruntMid': [(Y('1yell1'), *seg(320, 620)), (Y('1yell7'), *seg(540, 860)), (Y('1yell16'), *seg(540, 820))],
    'cryMid':   [(Y('1yell3'), *seg(780, 1420)), (Y('1yell5'), *seg(380, 920)), (Y('1yell4'), *seg(120, 680))],
    'gruntHigh': [(Y('3grunt5'), *seg(160, 500)), (Y('3grunt1'), *seg(540, 840)), (Y('3yell3'), *seg(260, 520))],
    'cryHigh':  [(Y('3yell1'), *seg(380, 1840)), (Y('3yell2'), *seg(260, 1420)), (Y('3yell9'), *seg(380, 1920))],
}
RATE = 44100
TARGET_RMS = 0.13   # 소리 나는 부분의 세기를 맞춘다 (약 -18 dBFS). 섞는 비율은 audio.js에서 정한다

def load(path, start, dur):
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(max(0, start))] + (['-t', str(dur)] if dur else []) + ['-i', path, '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).copy()

total = 0
for name, items in SETS.items():
    for i, (path, start, dur) in enumerate(items):
        x = load(path, start, dur)
        pk = np.abs(x).max()
        on = int(np.argmax(np.abs(x) > pk * 0.03))               # 앞 무음 자르기 (치는 순간이 바로 들리게)
        x = x[max(0, on - int(0.002 * RATE)):]
        win = 1024
        rms = [np.sqrt(np.mean(x[j:j + win] ** 2)) for j in range(0, len(x) - win, win // 2)] or [np.sqrt(np.mean(x ** 2))]
        act = np.array([r for r in rms if r > max(rms) * 0.25])
        x = x * min(TARGET_RMS / max(1e-6, np.sqrt(np.mean(act ** 2))), 0.95 / max(1e-6, np.abs(x).max()))
        f = min(len(x), int((0.2 if name == 'neigh' else 0.06) * RATE))   # 끝을 부드럽게
        x[-f:] *= np.linspace(1, 0, f)
        dst = os.path.join(OUT, f'{name}_{i}.mp3')
        br = '64k' if name.startswith(('cry', 'grunt', 'neigh')) else '80k'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', br, dst], input=x.astype(np.float32).tobytes(), check=True)
        total += os.path.getsize(dst)
        print(f'{name}_{i}.mp3', f'{len(x) / RATE:.2f}s', f'{os.path.getsize(dst) // 1024}KB')
print('total', total // 1024, 'KB')
