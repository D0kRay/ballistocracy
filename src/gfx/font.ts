import Phaser from 'phaser';

// Hand-made 3x5 pixel font, rendered into a retro bitmap font texture.
export const FONT_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?:-+/'()%*><=_#x";

const G: Record<string, string> = {
  ' ': '... ... ... ... ...',
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
  '.': '... ... ... ... .#.', ',': '... ... ... .#. #..', '!': '.#. .#. .#. ... .#.', '?': '##. ..# .#. ... .#.',
  ':': '... .#. ... .#. ...', '-': '... ... ### ... ...', '+': '... .#. ### .#. ...', '/': '..# ..# .#. #.. #..',
  "'": '.#. .#. ... ... ...', '(': '..# .#. .#. .#. ..#', ')': '#.. .#. .#. .#. #..', '%': '#.# ..# .#. #.. #.#',
  '*': '#.# .#. #.# ... ...', '>': '#.. .#. ..# .#. #..', '<': '..# .#. #.. .#. ..#', '=': '... ### ... ### ...',
  _: '... ... ... ... ###', '#': '#.# ### #.# ### #.#', x: '... #.# .#. #.# ...',
};

export function createPixelFont(scene: Phaser.Scene): void {
  const cw = 4;
  const ch = 6;
  const perRow = 16;
  const n = FONT_CHARS.length;
  const tex = scene.textures.createCanvas('font', perRow * cw, Math.ceil(n / perRow) * ch)!;
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) {
    const r = (G[FONT_CHARS[i]] ?? G[' ']).split(' ');
    const ox = (i % perRow) * cw;
    const oy = Math.floor(i / perRow) * ch;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (r[y]?.[x] === '#') ctx.fillRect(ox + x, oy + y, 1, 1);
  }
  tex.refresh();
  const cfg = {
    image: 'font',
    width: cw,
    height: ch,
    chars: FONT_CHARS,
    charsPerRow: perRow,
    spacing: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    lineSpacing: 2,
  } as unknown as Phaser.Types.GameObjects.BitmapText.RetroFontConfig;
  scene.cache.bitmapFont.add('pix', Phaser.GameObjects.RetroFont.Parse(scene, cfg));
}
