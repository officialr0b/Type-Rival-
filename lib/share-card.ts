export type ResultShareData = {
  wpm: number;
  accuracy: number;
  mode: string;
  handle: string;
  outcome?: string;
  opponentHandle?: string;
  host: string;
};

export function resultShareCaption(data: ResultShareData) {
  const versus = data.opponentHandle ? ` against ${data.opponentHandle}` : '';
  return `${Math.round(data.wpm)} WPM at ${data.accuracy.toFixed(1)}% accuracy${versus} on TypeRival. Think you can beat it? https://${data.host.replace(/^www\./, '')}`;
}

export function resultShareFileName(data: Pick<ResultShareData, 'wpm' | 'mode'>) {
  return `typerival-${data.mode.toLowerCase()}-${Math.round(data.wpm)}-wpm.png`;
}

export function createResultShareFile(data: ResultShareData) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot create a result card.');

  const gradient = context.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, '#050b14');
  gradient.addColorStop(0.62, '#0a1d2b');
  gradient.addColorStop(1, '#0d3438');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, 1350);

  context.strokeStyle = '#203752';
  context.lineWidth = 2;
  for (let x = -300; x < 1300; x += 120) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 520, 1350);
    context.stroke();
  }

  context.fillStyle = '#27dacb';
  roundRect(context, 74, 70, 92, 92, 20);
  context.fill();
  context.fillStyle = '#050b14';
  context.font = '900 34px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText('TR', 120, 130);

  context.textAlign = 'left';
  context.fillStyle = '#f6f8fc';
  context.font = '900 40px ui-sans-serif, system-ui, sans-serif';
  context.fillText('TYPE', 190, 127);
  const typeWidth = context.measureText('TYPE').width;
  context.fillStyle = '#27dacb';
  context.fillText('RIVAL', 190 + typeWidth, 127);

  context.textAlign = 'right';
  context.fillStyle = '#91a7bf';
  context.font = '800 24px ui-sans-serif, system-ui, sans-serif';
  context.fillText(`${data.mode.toUpperCase()} RUN`, 1006, 119);

  context.textAlign = 'center';
  context.fillStyle = '#91a7bf';
  context.font = '900 27px ui-sans-serif, system-ui, sans-serif';
  context.fillText('I JUST TYPED', 540, 322);
  context.fillStyle = '#f6f8fc';
  context.font = '900 330px ui-sans-serif, system-ui, sans-serif';
  context.fillText(String(Math.round(data.wpm)), 540, 650);
  context.fillStyle = '#27dacb';
  context.font = '900 54px ui-sans-serif, system-ui, sans-serif';
  context.fillText('WORDS PER MINUTE', 540, 730);

  context.fillStyle = 'rgba(5, 11, 20, 0.72)';
  roundRect(context, 100, 805, 880, 182, 24);
  context.fill();
  context.strokeStyle = '#315678';
  context.stroke();
  context.fillStyle = '#f6f8fc';
  context.font = '900 58px ui-sans-serif, system-ui, sans-serif';
  context.fillText(`${data.accuracy.toFixed(1)}%`, 330, 910);
  context.fillStyle = '#91a7bf';
  context.font = '900 22px ui-sans-serif, system-ui, sans-serif';
  context.fillText('ACCURACY', 330, 950);

  context.fillStyle = '#f6f8fc';
  context.font = '900 43px ui-sans-serif, system-ui, sans-serif';
  context.fillText(data.outcome ? data.outcome.toUpperCase() : 'RUN COMPLETE', 745, 910);
  context.fillStyle = '#91a7bf';
  context.font = '900 22px ui-sans-serif, system-ui, sans-serif';
  context.fillText(data.opponentHandle ? `VS ${data.opponentHandle.toUpperCase()}` : data.handle.toUpperCase(), 745, 950);

  context.fillStyle = '#f6f8fc';
  context.font = '900 48px ui-sans-serif, system-ui, sans-serif';
  context.fillText('CAN YOU BEAT IT?', 540, 1110);
  context.fillStyle = '#91a7bf';
  context.font = '700 27px ui-sans-serif, system-ui, sans-serif';
  context.fillText(data.host.replace(/^www\./, ''), 540, 1160);

  context.fillStyle = '#27dacb';
  context.fillRect(74, 1264, 932, 6);
  context.fillStyle = '#91a7bf';
  context.font = '700 21px ui-sans-serif, system-ui, sans-serif';
  context.fillText('SPEED IS LOUD. ACCURACY WINS.', 540, 1310);

  return dataUrlFile(canvas.toDataURL('image/png'), resultShareFileName(data));
}

function dataUrlFile(dataUrl: string, name: string) {
  const [metadata, encoded = ''] = dataUrl.split(',');
  const mime = metadata?.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mime });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
