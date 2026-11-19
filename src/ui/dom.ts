// Small HTML overlay for things a canvas is bad at: copying the session key and typing/pasting one.

function root(): HTMLElement {
  return document.getElementById('ui')!;
}

export function clearDom(): void {
  root().innerHTML = '';
}

export function showHostKey(key: string): void {
  clearDom();
  const box = document.createElement('div');
  box.className = 'panel';
  const label = document.createElement('div');
  label.textContent = 'SESSION KEY';
  const k = document.createElement('div');
  k.className = 'key';
  k.textContent = key;
  const btn = document.createElement('button');
  btn.textContent = 'COPY';
  btn.onclick = () => {
    void navigator.clipboard?.writeText(key).then(() => {
      btn.textContent = 'COPIED!';
      setTimeout(() => (btn.textContent = 'COPY'), 1200);
    });
  };
  box.append(label, k, btn);
  root().append(box);
}

export function showJoinBox(onJoin: (key: string) => void, error = ''): void {
  clearDom();
  const box = document.createElement('div');
  box.className = 'panel';
  const label = document.createElement('div');
  label.textContent = 'ENTER SESSION KEY';
  const input = document.createElement('input');
  input.maxLength = 8;
  input.placeholder = 'ABC123';
  input.autocomplete = 'off';
  input.spellcheck = false;
  const btn = document.createElement('button');
  btn.textContent = 'JOIN';
  const go = () => {
    const v = input.value.trim();
    if (v.length >= 4) {
      btn.disabled = true;
      btn.textContent = '...';
      onJoin(v);
    }
  };
  btn.onclick = go;
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') go();
  };
  box.append(label, input, btn);
  if (error) {
    const er = document.createElement('div');
    er.className = 'err';
    er.textContent = error;
    box.append(er);
  }
  root().append(box);
  setTimeout(() => input.focus(), 50);
}
