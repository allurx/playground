(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  if (window.location.protocol === 'file:') {
    $('playgroundLink').href = 'https://play.allurx.io/';
  }

  let toastTimer;
  let lastToast = '';

  function toast(message, duration = 4800) {
    if (message === lastToast && $('toast').classList.contains('show')) return;
    clearTimeout(toastTimer);
    lastToast = message;
    $('toast').textContent = message;
    $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), duration);
  }

  function engine() {
    return window.scene?.ready ? window.scene : null;
  }

  // Leave a light invitation until the visitor starts exploring; help remains available.
  const dismissInvitation = () => { $('playInvitation').hidden = true; };
  $('stage').addEventListener('pointerdown', dismissInvitation, { once: true });
  $('stage').addEventListener('keydown', (event) => {
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', '+', '-', '=', 'w', 'p', 'r'].includes(event.key.toLowerCase())) dismissInvitation();
  });

  // Start audio only after an explicit user action; suspend it while the page is hidden.
  let audioContext;
  let soundWanted = false;
  let soundRevision = 0;

  function updateSoundButton() {
    $('soundToggle').setAttribute('aria-pressed', String(soundWanted));
    $('soundLabel').textContent = '声音';
    const action = soundWanted ? '关闭海风与海浪声' : '开启海风与海浪声';
    $('soundToggle').setAttribute('aria-label', action);
    $('soundToggle').title = action;
  }

  function createOceanSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持环境声音。');
    const context = new AudioContextClass();
    const noiseBuffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i += 1) {
      brown = (brown + (Math.random() * 2 - 1) * 0.022) / 1.022;
      data[i] = brown * 3.5;
    }

    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const seaVolume = context.createGain();
    seaVolume.gain.value = 0.16;
    const swell = context.createOscillator();
    swell.type = 'sine';
    swell.frequency.value = 0.115;
    const swellDepth = context.createGain();
    swellDepth.gain.value = 0.08;
    noise.connect(filter).connect(seaVolume).connect(context.destination);
    swell.connect(swellDepth).connect(seaVolume.gain);
    noise.start();
    swell.start();
    return context;
  }

  async function applySound() {
    const revision = ++soundRevision;
    updateSoundButton();
    try {
      if (!soundWanted || document.hidden) {
        if (audioContext && audioContext.state !== 'closed') await audioContext.suspend();
        return;
      }
      audioContext ||= createOceanSound();
      await audioContext.resume();
      if (revision !== soundRevision) return;
      if (audioContext.state !== 'running') throw new Error('浏览器还没有允许播放声音，请再点一次。');
    } catch (error) {
      if (revision !== soundRevision) return;
      soundWanted = false;
      updateSoundButton();
      toast(error.message || '海风暂时没有连上，请再试一次。');
    }
  }

  $('soundToggle').addEventListener('click', () => {
    soundWanted = !soundWanted;
    void applySound();
  });
  document.addEventListener('visibilitychange', () => { void applySound(); });
  window.addEventListener('pagehide', () => { void audioContext?.suspend(); });
  window.addEventListener('scene:whale', () => {
    if (!soundWanted || audioContext?.state !== 'running' || document.hidden) return;
    const voice = audioContext.createOscillator();
    const volume = audioContext.createGain();
    const now = audioContext.currentTime;
    voice.type = 'sine';
    voice.frequency.setValueAtTime(190, now);
    voice.frequency.exponentialRampToValueAtTime(340, now + 0.7);
    voice.frequency.exponentialRampToValueAtTime(115, now + 2.5);
    volume.gain.setValueAtTime(0, now);
    volume.gain.linearRampToValueAtTime(0.07, now + 0.3);
    volume.gain.exponentialRampToValueAtTime(0.001, now + 2.6);
    voice.connect(volume).connect(audioContext.destination);
    voice.start();
    voice.stop(now + 2.7);
    voice.onended = () => { voice.disconnect(); volume.disconnect(); };
  });

  const postcardDialog = $('postcardDialog');
  postcardDialog.addEventListener('keydown', (event) => event.stopPropagation());
  postcardDialog.addEventListener('click', (event) => {
    if (event.target !== postcardDialog) return;
    const rect = postcardDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) postcardDialog.close();
  });
  for (const button of document.querySelectorAll('[data-close-dialog]')) {
    button.addEventListener('click', () => postcardDialog.close());
  }

  let postcardFrame;
  let postcardDate;
  let postcardBlob;
  let captureRevision = 0;
  let renderRevision = 0;
  let capturePending = false;

  function dateLabel(date) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date).replaceAll('/', '.');
  }

  function postcardMessage() {
    return Array.from($('postcardMessage').value).slice(0, 40).join('');
  }

  function drawWrappedText(context, message, x, y, width, lineHeight) {
    let line = '';
    let lineNumber = 0;
    for (const character of Array.from(message.replace(/\s+/g, ' ').trim())) {
      if (line && context.measureText(line + character).width > width) {
        context.fillText(line, x, y + lineNumber * lineHeight);
        line = '';
        lineNumber += 1;
      }
      line += character;
    }
    if (line) context.fillText(line, x, y + lineNumber * lineHeight);
  }

  async function renderPostcard() {
    if (!postcardFrame) return;
    const revision = ++renderRevision;
    postcardBlob = undefined;
    $('postcardDownload').disabled = true;
    const canvas = $('postcardCanvas');
    canvas.width = 2800;
    canvas.height = 1760;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成图片。');
    context.scale(2, 2);
    context.fillStyle = '#fffdf6';
    context.fillRect(0, 0, 1400, 880);

    context.save();
    context.beginPath();
    context.roundRect(44, 44, 1312, 700, 8);
    context.clip();
    context.fillStyle = '#edf2f3';
    context.fillRect(44, 44, 1312, 700);
    const imageScale = Math.min(1312 / postcardFrame.width, 700 / postcardFrame.height);
    const imageWidth = postcardFrame.width * imageScale;
    const imageHeight = postcardFrame.height * imageScale;
    context.drawImage(postcardFrame, 44 + (1312 - imageWidth) / 2, 44 + (700 - imageHeight) / 2, imageWidth, imageHeight);
    context.restore();

    const font = '"Microsoft YaHei", "PingFang SC", sans-serif';
    context.fillStyle = '#203b48';
    context.font = `600 26px ${font}`;
    context.fillText('小小海湾 · Tiny Bay', 58, 792);
    context.font = `25px ${font}`;
    context.fillStyle = '#526670';
    drawWrappedText(context, postcardMessage(), 58, 836, 1284, 32);
    context.font = `18px ${font}`;
    context.fillStyle = '#82928f';
    context.textAlign = 'right';
    context.fillText(`${dateLabel(postcardDate)} · 北纬 71°`, 1342, 792);
    context.textAlign = 'left';

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (revision !== renderRevision || !$('postcardDialog').open) return;
    if (!blob) throw new Error('图片没有生成成功，请重新拍一张。');
    postcardBlob = blob;
    $('postcardDownload').disabled = false;
    $('postcardStatus').textContent = '2800 × 1760 像素 · PNG';
  }

  async function takePostcard() {
    const api = engine();
    if (!api) {
      $('postcardStatus').textContent = '场景尚未就绪。';
      return;
    }
    const revision = ++captureRevision;
    renderRevision += 1;
    capturePending = true;
    postcardBlob = undefined;
    $('postcardRefresh').disabled = true;
    $('postcardDownload').disabled = true;
    $('postcardStatus').textContent = '正在生成图片……';
    try {
      const frame = await api.capture();
      if (revision !== captureRevision || !$('postcardDialog').open) return;
      postcardFrame = frame;
      postcardDate = new Date();
      capturePending = false;
      await renderPostcard();
    } catch (error) {
      if (revision === captureRevision) $('postcardStatus').textContent = error.message || '这张照片没拍好，请再试一次。';
    } finally {
      if (revision === captureRevision) {
        capturePending = false;
        $('postcardRefresh').disabled = !engine();
      }
    }
  }

  $('postcardButton').addEventListener('click', () => {
    if (!postcardDialog.open) postcardDialog.showModal();
    postcardDialog.scrollTop = 0;
    void takePostcard();
  });
  $('postcardRefresh').addEventListener('click', () => { void takePostcard(); });
  $('postcardDialog').addEventListener('close', () => {
    captureRevision += 1;
    renderRevision += 1;
    capturePending = false;
    postcardBlob = undefined;
    $('postcardDownload').disabled = true;
    $('postcardRefresh').disabled = !engine();
  });
  $('postcardMessage').maxLength = 40;
  $('postcardMessage').addEventListener('input', (event) => {
    if (event.isComposing) return;
    const message = postcardMessage();
    if ($('postcardMessage').value !== message) $('postcardMessage').value = message;
    if (!capturePending && postcardFrame) {
      void renderPostcard().catch((error) => { $('postcardStatus').textContent = error.message; });
    }
  });
  $('postcardMessage').addEventListener('compositionend', () => {
    $('postcardMessage').dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('postcardDownload').addEventListener('click', () => {
    if (!postcardBlob) return;
    const url = URL.createObjectURL(postcardBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tiny-bay-${dateLabel(postcardDate).replaceAll('.', '-')}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('postcardStatus').textContent = '已发起图片下载。';
  });

  function updateEngineControls() {
    const ready = Boolean(engine());
    $('postcardButton').disabled = !ready;
    $('postcardRefresh').disabled = !ready || capturePending;
  }
  window.addEventListener('scene:ready', updateEngineControls);
  window.addEventListener('scene:error', (event) => {
    updateEngineControls();
    if (postcardDialog.open) postcardDialog.close();
    $('postcardStatus').textContent = event.detail?.message || '小岛暂时无法绘制，请刷新后再试。';
    soundWanted = false;
    void applySound();
  });
  updateEngineControls();
  updateSoundButton();
})();
