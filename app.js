const rootNode = document.getElementById('root');

if (!window.React || !window.ReactDOM) {
  rootNode.innerHTML =
    "<div style='padding:24px;color:#e8eefc;font-family:\"Noto Sans KR\",sans-serif;background:#09111f;min-height:100vh;'>React 라이브러리를 불러오지 못했습니다. 인터넷 연결 또는 CDN 차단 여부를 확인해 주세요.</div>";
  throw new Error('React or ReactDOM failed to load.');
}

if (!window.CVUtils) {
  rootNode.innerHTML =
    "<div style='padding:24px;color:#e8eefc;font-family:\"Noto Sans KR\",sans-serif;background:#09111f;min-height:100vh;'>utils.js를 불러오지 못했습니다. 파일 경로와 인코딩 상태를 확인해 주세요.</div>";
  throw new Error('CVUtils failed to load.');
}

const { useEffect, useMemo, useRef, useState } = React;
const {
  createCanvas,
  formatNumber,
  sampleEvery,
  imageDataToDataUrl,
  floatArrayToImageData,
  getGrayChannel,
  resizeImageData,
  boxBlurGray,
  buildScaleSpace,
  findKeypointsFromDogs,
  drawKeypointsOverlay,
  buildHistogram,
  computeMultiOtsu,
  applyTriThreshold,
  runKMeans,
  splitBlocks,
  mergeBlocks,
  renderSplitMergeMap,
  buildGraphSegmentation,
  drawHistogram,
  drawMstPreview,
  gaussianBlurGray,
  subtractArrays,
} = window.CVUtils;

const GROUPS = [
  {
    id: 'feature',
    title: '위치 찾기 알고리즘',
    modules: [
      { id: 'scale', title: '스케일 공간', subtitle: '피라미드와 축소 비교' },
      { id: 'harris', title: '해리스-라플라스', subtitle: '코너 응답과 hover 해설' },
      { id: 'sift', title: 'SIFT', subtitle: 'DoG와 방향 설명' },
      { id: 'surf', title: 'SURF', subtitle: '빠른 근사 응답' },
    ],
  },
  {
    id: 'segment',
    title: '영상 분할 알고리즘',
    modules: [
      { id: 'threshold', title: '임계화 분할', subtitle: '오츠와 적응형 비교' },
      { id: 'kmeans', title: 'K-means 분할', subtitle: 'RGB 군집화' },
      { id: 'splitmerge', title: '분할합병', subtitle: '4진 트리 기반' },
      { id: 'mst', title: '최소 신장 트리', subtitle: '그래프 분할과 k' },
    ],
  },
];

function makePreset(kind) {
  const canvas = createCanvas(360, 240);
  const ctx = canvas.getContext('2d');

  if (kind === 'sunflower') {
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, '#7fc8f8');
    gradient.addColorStop(0.5, '#b7e4c7');
    gradient.addColorStop(1, '#5b8c5a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 360, 240);
    ctx.fillStyle = '#7c5c1b';
    ctx.fillRect(0, 140, 360, 100);
    for (let i = 0; i < 22; i += 1) {
      const x = 20 + (i % 11) * 31;
      const y = 125 + Math.floor(i / 11) * 52;
      ctx.strokeStyle = '#2d6a4f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y + 25);
      ctx.lineTo(x, y + 65);
      ctx.stroke();
      ctx.fillStyle = '#5b3a1a';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (kind === 'cell') {
    ctx.fillStyle = '#0e1726';
    ctx.fillRect(0, 0, 360, 240);
    for (let i = 0; i < 50; i += 1) {
      const x = 20 + ((i * 47) % 320);
      const y = 20 + ((i * 73) % 180);
      const r = 10 + (i % 5) * 7;
      const gradient = ctx.createRadialGradient(x, y, 2, x, y, r);
      gradient.addColorStop(0, 'rgba(199,249,204,0.95)');
      gradient.addColorStop(1, 'rgba(82,183,136,0.15)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (kind === 'beach') {
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, '#90e0ef');
    gradient.addColorStop(0.4, '#caf0f8');
    gradient.addColorStop(0.41, '#00b4d8');
    gradient.addColorStop(0.64, '#0077b6');
    gradient.addColorStop(0.65, '#f1dca7');
    gradient.addColorStop(1, '#d4a373');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 360, 240);
  }

  return ctx.getImageData(0, 0, 360, 240);
}

function presets() {
  return [
    { id: 'sunflower', name: '해바라기 밭', note: '색상 군집과 특징 비교' },
    { id: 'cell', name: '세포 현미경', note: '미세 구조와 적응형 분할' },
    { id: 'beach', name: '해변 풍경', note: '큰 영역 분할과 스케일 비교' },
  ].map((preset) => {
    const imageData = makePreset(preset.id);
    return { ...preset, imageData, url: imageDataToDataUrl(imageData) };
  });
}

function ImageFrame({ title, src, meta }) {
  return (
    <div className="image-frame">
      <img src={src} alt={title} />
      <div className="image-caption">
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
    </div>
  );
}

function CanvasFrame({ width, height, draw, deps = [] }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) draw(ref.current);
  }, deps);
  return <canvas className="chart-surface" ref={ref} width={width} height={height} />;
}

function Plot3D({ points, centroids }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !window.Plotly) return;

    window.Plotly.react(
      ref.current,
      [
        {
          x: points.map((point) => point.rgb[0]),
          y: points.map((point) => point.rgb[1]),
          z: points.map((point) => point.rgb[2]),
          mode: 'markers',
          type: 'scatter3d',
          marker: {
            size: 3,
            opacity: 0.6,
            color: points.map((point) => point.cluster),
            colorscale: 'Viridis',
          },
        },
        {
          x: centroids.map((centroid) => centroid[0]),
          y: centroids.map((centroid) => centroid[1]),
          z: centroids.map((centroid) => centroid[2]),
          mode: 'markers',
          type: 'scatter3d',
          marker: {
            size: 8,
            color: '#ffb86b',
            symbol: 'diamond',
          },
        },
      ],
      {
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        scene: {
          bgcolor: 'rgba(0,0,0,0)',
          xaxis: { title: 'R', color: '#cfe2ff' },
          yaxis: { title: 'G', color: '#cfe2ff' },
          zaxis: { title: 'B', color: '#cfe2ff' },
        },
        showlegend: false,
      },
      { displayModeBar: false, responsive: true }
    );
  }, [points, centroids]);

  return <div ref={ref} className="chart-surface" style={{ height: 340 }} />;
}

function grads(gray, width, height) {
  const ix = new Float32Array(gray.length);
  const iy = new Float32Array(gray.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      ix[index] = (gray[index + 1] - gray[index - 1]) * 0.5;
      iy[index] = (gray[index + width] - gray[index - width]) * 0.5;
    }
  }

  return { ix, iy };
}

function norm(values, width, height, tint = [1, 1, 1]) {
  return imageDataToDataUrl(floatArrayToImageData(values, width, height, { grayscale: false, tint }));
}

function orientPoints(imageData, points) {
  const gray = getGrayChannel(imageData);
  const { ix, iy } = grads(gray, imageData.width, imageData.height);
  return points.map((point) => {
    const index = point.y * imageData.width + point.x;
    return {
      ...point,
      angle: Math.atan2(iy[index], ix[index]),
      magnitude: Math.hypot(ix[index], iy[index]),
    };
  });
}

function drawPts(imageData, points, color, withAngle = false) {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  points.forEach((point) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.r || 4, 0, Math.PI * 2);
    ctx.stroke();

    if (withAngle) {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + Math.cos(point.angle) * 10, point.y + Math.sin(point.angle) * 10);
      ctx.stroke();
    }
  });

  return canvas.toDataURL();
}

function patchZoom(imageData, x, y, radius = 10, scale = 8) {
  const size = radius * 2 + 1;
  const patch = new ImageData(size, size);

  for (let yy = -radius; yy <= radius; yy += 1) {
    for (let xx = -radius; xx <= radius; xx += 1) {
      const sx = Math.max(0, Math.min(imageData.width - 1, x + xx));
      const sy = Math.max(0, Math.min(imageData.height - 1, y + yy));
      const sourceIndex = (sy * imageData.width + sx) * 4;
      const destIndex = ((yy + radius) * size + (xx + radius)) * 4;
      patch.data[destIndex] = imageData.data[sourceIndex];
      patch.data[destIndex + 1] = imageData.data[sourceIndex + 1];
      patch.data[destIndex + 2] = imageData.data[sourceIndex + 2];
      patch.data[destIndex + 3] = 255;
    }
  }

  const sourceCanvas = createCanvas(size, size);
  sourceCanvas.getContext('2d').putImageData(patch, 0, 0);
  const resultCanvas = createCanvas(size * scale, size * scale);
  const ctx = resultCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, resultCanvas.width, resultCanvas.height);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(radius * scale, radius * scale, scale, scale);
  return resultCanvas.toDataURL();
}

function computeHarrisResponse(grayData, width, height, sigma = 1.4, k = 0.04) {
  const { ix, iy } = grads(grayData, width, height);
  const ixx = new Float32Array(width * height);
  const iyy = new Float32Array(width * height);
  const ixy = new Float32Array(width * height);

  for (let i = 0; i < ixx.length; i += 1) {
    ixx[i] = ix[i] * ix[i];
    iyy[i] = iy[i] * iy[i];
    ixy[i] = ix[i] * iy[i];
  }

  const sxx = gaussianBlurGray(ixx, width, height, sigma);
  const syy = gaussianBlurGray(iyy, width, height, sigma);
  const sxy = gaussianBlurGray(ixy, width, height, sigma);
  const response = new Float32Array(width * height);

  for (let i = 0; i < response.length; i += 1) {
    const det = sxx[i] * syy[i] - sxy[i] * sxy[i];
    const trace = sxx[i] + syy[i];
    response[i] = det - k * trace * trace;
  }

  return { response, sxx, syy, sxy };
}

function harrisAt(imageData, x, y) {
  const gray = getGrayChannel(imageData);
  const { ix, iy } = grads(gray, imageData.width, imageData.height);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;

  for (let yy = Math.max(1, y - 7); yy <= Math.min(imageData.height - 2, y + 7); yy += 1) {
    for (let xx = Math.max(1, x - 7); xx <= Math.min(imageData.width - 2, x + 7); xx += 1) {
      const index = yy * imageData.width + xx;
      sxx += ix[index] * ix[index];
      syy += iy[index] * iy[index];
      sxy += ix[index] * iy[index];
    }
  }

  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const root = Math.sqrt(Math.max(trace * trace - 4 * det, 0));
  const l1 = (trace + root) * 0.5;
  const l2 = (trace - root) * 0.5;
  const response = det - 0.04 * trace * trace;

  let sentence = '밝기 변화가 작아서 flat에 가깝습니다.';
  if (l1 > 12000 && l2 > 6000) {
    sentence = 'x, y 방향 모두 변화가 커서 corner 가능성이 높습니다.';
  } else if (l1 > 12000 && l2 < 2500) {
    sentence = '한 방향으로만 변화가 커서 edge에 가깝습니다.';
  }

  return { response, l1, l2, sentence };
}

function adaptive(gray, width, height, t1, t2) {
  const local = boxBlurGray(gray, width, height, 5);
  const shifted = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    shifted[i] = gray[i] - local[i] + 128;
  }
  return applyTriThreshold(shifted, width, height, t1, t2);
}

function analyzeMultiOtsu(histogram, total) {
  const probs = histogram.map((count) => count / total);
  const omega = new Array(256).fill(0);
  const mu = new Array(256).fill(0);
  omega[0] = probs[0];
  mu[0] = 0;

  for (let i = 1; i < 256; i += 1) {
    omega[i] = omega[i - 1] + probs[i];
    mu[i] = mu[i - 1] + i * probs[i];
  }

  const globalMean = mu[255];
  let best = { t1: 85, t2: 170, score: -Infinity };
  const topCandidates = [];

  function pushCandidate(candidate) {
    topCandidates.push(candidate);
    topCandidates.sort((a, b) => b.score - a.score);
    if (topCandidates.length > 4) topCandidates.length = 4;
  }

  for (let t1 = 1; t1 < 254; t1 += 1) {
    for (let t2 = t1 + 1; t2 < 255; t2 += 1) {
      const w0 = omega[t1];
      const w1 = omega[t2] - omega[t1];
      const w2 = 1 - omega[t2];
      if (w0 < 1e-6 || w1 < 1e-6 || w2 < 1e-6) continue;

      const m0 = mu[t1] / w0;
      const m1 = (mu[t2] - mu[t1]) / w1;
      const m2 = (mu[255] - mu[t2]) / w2;
      const score =
        w0 * (m0 - globalMean) ** 2 +
        w1 * (m1 - globalMean) ** 2 +
        w2 * (m2 - globalMean) ** 2;

      const candidate = { t1, t2, score, w0, w1, w2, m0, m1, m2 };
      if (score > best.score) best = candidate;
      if (topCandidates.length < 4 || score > topCandidates[topCandidates.length - 1].score) {
        pushCandidate(candidate);
      }
    }
  }

  const classStats = [
    { label: "영역 0", range: `0 ~ ${best.t1}`, weight: best.w0, mean: best.m0 },
    { label: "영역 1", range: `${best.t1 + 1} ~ ${best.t2}`, weight: best.w1, mean: best.m1 },
    { label: "영역 2", range: `${best.t2 + 1} ~ 255`, weight: best.w2, mean: best.m2 },
  ];

  return { globalMean, best, topCandidates, classStats };
}

function surfResponses(imageData) {
  const gray = getGrayChannel(imageData);
  return [9, 15, 21, 27].map((size) => {
    const blur = boxBlurGray(gray, imageData.width, imageData.height, Math.max(1, Math.floor(size / 6)));
    const diff = subtractArrays(blur, gray);
    return {
      size,
      preview: norm(diff, imageData.width, imageData.height, [1, 0.78, 0.46]),
      strength: formatNumber(diff.reduce((sum, value) => sum + Math.abs(value), 0) / diff.length, 1),
    };
  });
}

function quad(canvas, steps, progress) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#09111f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  steps.slice(0, Math.max(1, Math.floor(steps.length * progress))).forEach((step) => {
    const x = (step.x / 240) * canvas.width;
    const y = (step.y / 240) * canvas.height;
    const size = (step.size / 240) * Math.min(canvas.width, canvas.height);
    ctx.strokeStyle = step.action === 'split' ? 'rgba(255,184,107,0.9)' : 'rgba(102,217,195,0.85)';
    ctx.strokeRect(x, y, size, size);
  });
}

function graph(canvas, seg, progress) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#09111f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / seg.width;
  const scaleY = canvas.height / seg.height;

  seg.mstEdges.slice(0, Math.max(1, Math.floor(seg.mstEdges.length * progress))).forEach((edge, index) => {
    const ax = (edge.a % seg.width) * scaleX + scaleX / 2;
    const ay = Math.floor(edge.a / seg.width) * scaleY + scaleY / 2;
    const bx = (edge.b % seg.width) * scaleX + scaleX / 2;
    const by = Math.floor(edge.b / seg.width) * scaleY + scaleY / 2;
    ctx.strokeStyle = `hsla(${190 + (index % 120)},80%,70%,0.3)`;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  });
}

function ScaleModule({ imageData, sourceUrl }) {
  const [sigma, setSigma] = useState(1.8);
  const [ratio, setRatio] = useState(0.2);

  const info = useMemo(() => {
    const gray = getGrayChannel(imageData);
    const blurred = gaussianBlurGray(gray, imageData.width, imageData.height, sigma);
    return {
      blurUrl: imageDataToDataUrl(floatArrayToImageData(blurred, imageData.width, imageData.height)),
      smallUrl: imageDataToDataUrl(resizeImageData(imageData, ratio)),
      scaleSpace: buildScaleSpace(imageData),
    };
  }, [imageData, sigma, ratio]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>스케일 공간 시뮬레이터</h2>
          <p className="summary">가우시안 블러와 이미지 축소를 함께 보면서 스케일 변화 효과를 확인합니다.</p>
        </div>
        <div className="foot-note">한 옥타브당 6장 Gaussian 이미지</div>
      </div>

      <div className="control-card glass">
        <div className="control-grid">
          <div className="control">
            <label>sigma</label>
            <input type="range" min="0.6" max="4.2" step="0.1" value={sigma} onChange={(e) => setSigma(Number(e.target.value))} />
            <div className="value-chip">{formatNumber(sigma, 1)}</div>
          </div>
          <div className="control">
            <label>축소 비율</label>
            <input type="range" min="0.1" max="0.5" step="0.05" value={ratio} onChange={(e) => setRatio(Number(e.target.value))} />
            <div className="value-chip">{formatNumber(ratio, 2)}</div>
          </div>
          <div className="control">
            <label>옥타브</label>
            <div className="value-chip">2</div>
          </div>
          <div className="control">
            <label>레이어</label>
            <div className="value-chip">6</div>
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-7">
          <h3>스케일 비교</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="input" />
            <ImageFrame title="축소 영상" src={info.smallUrl} meta={`${formatNumber(ratio, 2)}x`} />
            <ImageFrame title="Gaussian blur" src={info.blurUrl} meta={`sigma ${formatNumber(sigma, 1)}`} />
          </div>
        </div>

        <div className="stage-card glass span-5">
          <h3>학습 포인트</h3>
          <div className="metrics-row">
            <div className="metric"><strong>Scale</strong>다양한 크기에서 특징 관찰</div>
            <div className="metric"><strong>Octave</strong>절반 크기로 피라미드 구성</div>
            <div className="metric"><strong>Sigma</strong>흐림 정도 조절</div>
          </div>
        </div>

        <div className="stage-card glass span-12">
          <h3>가우시안 피라미드</h3>
          {info.scaleSpace.octaveImages.map((octave, octaveIndex) => (
            <div key={octaveIndex} style={{ marginBottom: 18 }}>
              <div className="image-caption" style={{ marginBottom: 10 }}>
                <strong>{`옥타브 ${octaveIndex + 1}`}</strong>
                <span>{`${octave[0].width} x ${octave[0].height}`}</span>
              </div>
              <div className="mini-grid">
                {octave.map((level, levelIndex) => (
                  <ImageFrame
                    key={levelIndex}
                    title={`G${levelIndex + 1}`}
                    src={level.url}
                    meta={`sigma ${formatNumber(level.sigma, 2)}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HarrisModule({ imageData, sourceUrl }) {
  const analysis = useMemo(() => {
    const scaleSpace = buildScaleSpace(imageData);
    const layers = scaleSpace.octaveImages[0].slice(0, 4).map((level) => {
      const { response } = computeHarrisResponse(level.data, level.width, level.height, Math.max(1.2, level.sigma));
      return {
        sigma: level.sigma,
        preview: norm(response, level.width, level.height, [0.4, 1, 0.9]),
      };
    });
    const dogs = scaleSpace.dogImages[0];
    const points = findKeypointsFromDogs(dogs, dogs[0].width, dogs[0].height, 14)
      .slice(0, 60)
      .map((point) => ({ ...point, r: 3 + point.level * 1.5 }));
    return {
      layers,
      overlay: drawPts(imageData, points, '#66d9c3'),
    };
  }, [imageData]);

  const [point, setPoint] = useState({
    x: Math.floor(imageData.width / 2),
    y: Math.floor(imageData.height / 2),
  });

  useEffect(() => {
    setPoint({
      x: Math.floor(imageData.width / 2),
      y: Math.floor(imageData.height / 2),
    });
  }, [imageData]);

  const info = useMemo(() => {
    return {
      patch: patchZoom(imageData, point.x, point.y),
      ...harrisAt(imageData, point.x, point.y),
    };
  }, [imageData, point]);

  const move = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPoint({
      x: Math.max(0, Math.min(imageData.width - 1, Math.round(((event.clientX - rect.left) / rect.width) * imageData.width))),
      y: Math.max(0, Math.min(imageData.height - 1, Math.round(((event.clientY - rect.top) / rect.height) * imageData.height))),
    });
  };

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>해리스-라플라스 시뮬레이터</h2>
          <p className="summary">Harris 코너 응답을 보면서 flat, edge, corner 차이를 마우스 이동으로 이해할 수 있게 구성했습니다.</p>
        </div>
        <div className="foot-note">corner를 찾고 스케일 선택으로 이어집니다.</div>
      </div>

      <div className="stage-card glass span-12">
        <h3>핵심 개념</h3>
        <div className="edu-grid">
          <div className="edu-card"><strong>flat</strong><p>어느 방향으로 움직여도 변화가 거의 없습니다.</p></div>
          <div className="edu-card"><strong>edge</strong><p>한 방향으로만 변화가 큽니다.</p></div>
          <div className="edu-card"><strong>corner</strong><p>여러 방향으로 움직여도 변화가 큽니다.</p></div>
        </div>
        <div className="emphasis-box" style={{ marginTop: 12 }}>Harris response가 클수록 코너일 가능성이 높습니다.</div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-5">
          <h3>최종 특징점</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="input" />
            <ImageFrame title="Harris overlay" src={analysis.overlay} meta="corner candidates" />
          </div>
        </div>

        <div className="stage-card glass span-7">
          <h3>스케일별 응답</h3>
          <div className="mini-grid">
            {analysis.layers.map((layer, index) => (
              <ImageFrame
                key={index}
                title={`sigma ${formatNumber(layer.sigma, 2)}`}
                src={layer.preview}
                meta={`layer ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="stage-card glass span-12">
          <h3>실시간 지점 해설</h3>
          <div className="inspector-grid">
            <div className="edu-card">
              <strong>원본 이미지 탐색</strong>
              <div className="click-target" onMouseMove={move} onMouseEnter={move}>
                <img className="patch-box" src={sourceUrl} alt="interactive source" />
              </div>
              <div className="emphasis-box" style={{ marginTop: 10 }}>
                현재 좌표: x = {point.x}, y = {point.y}
              </div>
            </div>

            <div className="edu-card">
              <strong>패치 확대</strong>
              <img className="patch-box" src={info.patch} alt="patch zoom" />
            </div>

            <div className="edu-card">
              <strong>판정 결과</strong>
              <p>Harris response: {formatNumber(info.response, 2)}</p>
              <p>lambda1: {formatNumber(info.l1, 2)}</p>
              <p>lambda2: {formatNumber(info.l2, 2)}</p>
              <div className="emphasis-box" style={{ marginTop: 10 }}>{info.sentence}</div>
            </div>

            <div className="edu-card">
              <strong>한계</strong>
              <p>Harris는 코너 검출에는 강하지만 스케일 변화에는 약해서 이후 SIFT나 Harris-Laplace로 확장됩니다.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SiftModule({ imageData, sourceUrl }) {
  const info = useMemo(() => {
    const scaleSpace = buildScaleSpace(imageData);
    const dogs = scaleSpace.dogImages[0];
    const points = findKeypointsFromDogs(dogs, dogs[0].width, dogs[0].height, 14);
    const oriented = orientPoints(imageData, points.slice(0, 70)).map((point) => ({ ...point, r: 4 }));
    return {
      dogs,
      overlay: drawKeypointsOverlay(imageData, points, 1),
      orient: drawPts(imageData, oriented, '#ffb86b', true),
      count: points.length,
    };
  }, [imageData]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>SIFT 시뮬레이터</h2>
          <p className="summary">왜 blur를 하고, 왜 극점을 찾고, 왜 방향과 descriptor를 붙이는지 단계별로 보여줍니다.</p>
        </div>
        <div className="foot-note">scale, orientation, descriptor</div>
      </div>

      <div className="stage-card glass span-12">
        <h3>SIFT 전체 흐름</h3>
        <div className="edu-grid">
          <div className="edu-card"><strong>1. 스케일 공간</strong><p>특징을 찾기 위한 관측 환경을 만듭니다.</p></div>
          <div className="edu-card"><strong>2. DoG 극점</strong><p>주변보다 튀는 안정적인 지점을 찾습니다.</p></div>
          <div className="edu-card"><strong>3. 방향 할당</strong><p>회전 변화에 강인하게 만듭니다.</p></div>
          <div className="edu-card"><strong>4. Descriptor</strong><p>주변 모양을 숫자 벡터로 압축합니다.</p></div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-5">
          <h3>DoG 특징점</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="input" />
            <ImageFrame title="DoG keypoints" src={info.overlay} meta={`${info.count} points`} />
          </div>
        </div>

        <div className="stage-card glass span-7">
          <h3>방향 할당</h3>
          <ImageFrame title="orientation overlay" src={info.orient} meta="rotation invariant" />
        </div>

        <div className="stage-card glass span-12">
          <h3>DoG 차영상 배열</h3>
          <div className="mini-grid">
            {info.dogs.map((dog, index) => (
              <ImageFrame key={index} title={`DoG ${index + 1}`} src={dog.url} meta={`slice ${index + 1}`} />
            ))}
          </div>
        </div>

        <div className="stage-card glass span-12">
          <div className="emphasis-box">SIFT는 단순한 코너 검출이 아니라 특징을 찾고 방향을 맞추고 숫자로 표현해 다른 이미지와 매칭하게 만듭니다.</div>
        </div>
      </div>
    </div>
  );
}

function SurfModule({ imageData, sourceUrl }) {
  const responses = useMemo(() => surfResponses(imageData), [imageData]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>SURF 시뮬레이터</h2>
          <p className="summary">SURF가 왜 빠른지, SIFT와 무엇이 다른지, 어떤 근사 아이디어로 속도를 얻는지 보여줍니다.</p>
        </div>
        <div className="foot-note">SURF는 SIFT를 빠르게 만든 알고리즘입니다.</div>
      </div>

      <div className="stage-card glass span-12">
        <h3>핵심 개념</h3>
        <div className="edu-grid">
          <div className="edu-card"><strong>Integral Image</strong><p>영역 합을 빠르게 계산하는 누적합 구조입니다.</p></div>
          <div className="edu-card"><strong>Box Filter</strong><p>Gaussian을 단순하게 근사해 속도를 얻습니다.</p></div>
          <div className="edu-card"><strong>Hessian 기반</strong><p>주변과 다른 덩어리 구조를 찾습니다.</p></div>
          <div className="edu-card"><strong>Descriptor</strong><p>특징을 숫자 벡터로 만들어 매칭에 사용합니다.</p></div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-4">
          <h3>원본 영상</h3>
          <ImageFrame title="input" src={sourceUrl} meta={`${imageData.width} x ${imageData.height}`} />
        </div>

        <div className="stage-card glass span-8">
          <h3>필터 크기 확장</h3>
          <div className="mini-grid">
            {responses.map((item) => (
              <ImageFrame
                key={item.size}
                title={`${item.size} x ${item.size}`}
                src={item.preview}
                meta={`strength ${item.strength}`}
              />
            ))}
          </div>
        </div>

        <div className="stage-card glass span-12">
          <div className="emphasis-box">정확도를 조금 희생하고 속도를 크게 얻는 것이 SURF의 핵심입니다.</div>
        </div>
      </div>
    </div>
  );
}
function ThresholdModule({ imageData, sourceUrl }) {
  const gray = useMemo(() => getGrayChannel(imageData), [imageData]);
  const histogram = useMemo(() => buildHistogram(gray), [gray]);
  const otsu = useMemo(() => computeMultiOtsu(histogram, gray.length), [histogram, gray.length]);
  const otsuAnalysis = useMemo(() => analyzeMultiOtsu(histogram, gray.length), [histogram, gray.length]);
  const [t1, setT1] = useState(otsu.t1);
  const [t2, setT2] = useState(otsu.t2);
  const [mode, setMode] = useState('global');

  useEffect(() => {
    setT1(otsu.t1);
    setT2(otsu.t2);
  }, [otsu.t1, otsu.t2]);

  const segmented = useMemo(() => {
    const a = Math.min(t1, t2 - 1);
    const b = Math.max(t2, a + 1);
    return mode === 'global'
      ? applyTriThreshold(gray, imageData.width, imageData.height, a, b)
      : adaptive(gray, imageData.width, imageData.height, a, b);
  }, [gray, imageData, t1, t2, mode]);
  const otsuSegmented = useMemo(() => {
    return mode === 'global'
      ? applyTriThreshold(gray, imageData.width, imageData.height, otsu.t1, otsu.t2)
      : adaptive(gray, imageData.width, imageData.height, otsu.t1, otsu.t2);
  }, [gray, imageData, mode, otsu.t1, otsu.t2]);
  const applyOtsuPreset = () => {
    setT1(otsu.t1);
    setT2(otsu.t2);
  };

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>임계화 분할</h2>
          <p className="summary">히스토그램과 이중 임계값을 보면서 전역 임계화와 적응형 임계화의 차이를 비교합니다.</p>
        </div>
        <div className="foot-note">추천 오츠 임계값: t1 = {otsu.t1}, t2 = {otsu.t2}</div>
      </div>

      <div className="control-card glass">
        <div className="compare-row" style={{ marginBottom: 12 }}>
          <button className="tab-button active" onClick={applyOtsuPreset}>
            추천 오츠 임계값 적용
            <span>{`자동 계산값 t1=${otsu.t1}, t2=${otsu.t2}`}</span>
          </button>
          <div className="edu-card">
            <strong>오츠 기준</strong>
            <p>히스토그램을 가장 잘 나누는 임계값 조합을 자동으로 추천합니다.</p>
          </div>
          <div className="edu-card">
            <strong>현재 슬라이더</strong>
            <p>{`현재 설정 t1=${t1}, t2=${t2}`}</p>
          </div>
        </div>
        <div className="control-grid">
          <div className="control">
            <label>t1</label>
            <input type="range" min="0" max="254" value={t1} onChange={(e) => setT1(Number(e.target.value))} />
            <div className="value-chip">{t1}</div>
          </div>
          <div className="control">
            <label>t2</label>
            <input type="range" min="1" max="255" value={t2} onChange={(e) => setT2(Number(e.target.value))} />
            <div className="value-chip">{t2}</div>
          </div>
          <div className="control">
            <label>비교 모드</label>
            <button className={`tab-button ${mode === 'global' ? 'active' : ''}`} onClick={() => setMode(mode === 'global' ? 'adaptive' : 'global')}>
              {mode === 'global' ? '전역 임계화' : '적응형 임계화'}
              <span>클릭해서 전환</span>
            </button>
          </div>
          <div className="control">
            <label>출력</label>
            <div className="value-chip">0 / 1 / 2 영역</div>
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-7">
          <h3>명암 히스토그램</h3>
          <CanvasFrame
            width={760}
            height={240}
            draw={(canvas) => drawHistogram(canvas, histogram, Math.min(t1, t2 - 1), Math.max(t2, t1 + 1))}
            deps={[histogram, t1, t2]}
          />
        </div>

        <div className="stage-card glass span-5">
          <h3>분할 결과</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="input" />
            <ImageFrame title={mode === 'global' ? '전역 임계화' : '적응형 임계화'} src={imageDataToDataUrl(segmented)} meta="삼진 결과" />
            <ImageFrame title="오츠 자동 분할" src={imageDataToDataUrl(otsuSegmented)} meta={`t1=${otsu.t1}, t2=${otsu.t2}`} />
          </div>
        </div>

        <div className="stage-card glass span-12">
          <h3>추천 오츠 임계값 도출 과정</h3>
          <div className="edu-grid">
            <div className="edu-card">
              <strong>1. 세 구간으로 나누기</strong>
              <p>후보 t1, t2를 움직이며 히스토그램을 3개 영역으로 가릅니다.</p>
            </div>
            <div className="edu-card">
              <strong>2. 영역별 통계 계산</strong>
              <p>각 영역의 픽셀 비중과 평균 밝기를 계산합니다.</p>
            </div>
            <div className="edu-card">
              <strong>3. 분리 점수 비교</strong>
              <p>세 영역 평균이 전체 평균에서 얼마나 멀어지는지 비교합니다.</p>
            </div>
            <div className="edu-card">
              <strong>4. 최적 조합 선택</strong>
              <p>가장 잘 분리되는 조합이 추천 오츠 임계값이 됩니다.</p>
            </div>
          </div>
          <div className="emphasis-box" style={{ marginTop: 12 }}>
            {`현재 추천 조합은 t1=${otsuAnalysis.best.t1}, t2=${otsuAnalysis.best.t2} 이고, 클래스 간 분산 점수는 ${formatNumber(otsuAnalysis.best.score, 4)} 입니다.`}
          </div>
        </div>

        <div className="stage-card glass span-7">
          <h3>세 영역 통계</h3>
          <div className="compare-row">
            {otsuAnalysis.classStats.map((item) => (
              <div key={item.label} className="compare-item">
                <strong>{item.label}</strong>
                <div className="value-chip">{item.range}</div>
                <p>{`픽셀 비중 ${formatNumber(item.weight * 100, 1)}%`}</p>
                <p>{`평균 밝기 ${formatNumber(item.mean, 1)}`}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="stage-card glass span-5">
          <h3>상위 후보 비교</h3>
          <div className="edu-grid">
            {otsuAnalysis.topCandidates.map((candidate, index) => (
              <div key={`${candidate.t1}-${candidate.t2}`} className="edu-card">
                <strong>{index === 0 ? "최종 선택" : `후보 ${index + 1}`}</strong>
                <p>{`t1=${candidate.t1}, t2=${candidate.t2}`}</p>
                <p>{`점수 ${formatNumber(candidate.score, 4)}`}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KMeansModule({ imageData, sourceUrl }) {
  const [k, setK] = useState(4);
  const [stage, setStage] = useState(0);
  const km = useMemo(() => runKMeans(imageData, k, 8), [imageData, k]);
  const initialCentroids = useMemo(() => sampleEvery(km.scatterPoints, k).map((point) => point.rgb), [km, k]);

  useEffect(() => {
    setStage(0);
    const timers = [1, 2, 3].map((step, index) => setTimeout(() => setStage(step), 650 * (index + 1)));
    return () => timers.forEach(clearTimeout);
  }, [k]);

  const stageLabel =
    stage === 0 ? '샘플 배치' :
    stage === 1 ? '중심점 초기화' :
    stage === 2 ? '가까운 중심점에 배정' :
    '최종 군집화 완료';

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>K-means 컬러 군집화</h2>
          <p className="summary">RGB 공간의 점들이 어떻게 묶이는지 3D 산점도와 결과 영상으로 함께 확인합니다.</p>
        </div>
        <div className="foot-note">현재 k = {k}, 단계 = {stageLabel}</div>
      </div>

      <div className="control-card glass">
        <div className="control-grid">
          <div className="control">
            <label>군집 수 k</label>
            <input type="range" min="2" max="8" value={k} onChange={(e) => setK(Number(e.target.value))} />
            <div className="value-chip">{k}</div>
          </div>
          <div className="control">
            <label>단계</label>
            <div className="value-chip">{stageLabel}</div>
          </div>
          <div className="control">
            <label>초기 중심점</label>
            <div className="value-chip">{initialCentroids.length}개</div>
          </div>
          <div className="control">
            <label>최종 중심점</label>
            <div className="value-chip">{km.centroids.length}개</div>
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-7">
          <h3>RGB 3D 산점도</h3>
          <Plot3D points={km.scatterPoints} centroids={stage >= 3 ? km.centroids : initialCentroids} />
        </div>

        <div className="stage-card glass span-5">
          <h3>군집화 결과</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="input" />
            <ImageFrame title={`K-means (k=${k})`} src={imageDataToDataUrl(km.segmented)} meta={stageLabel} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitMergeModule({ imageData, sourceUrl }) {
  const [varianceThreshold, setVarianceThreshold] = useState(320);
  const [minBlockSize, setMinBlockSize] = useState(24);
  const [mergeThreshold, setMergeThreshold] = useState(18);
  const [progress, setProgress] = useState(0.2);

  const result = useMemo(() => {
    const gray = getGrayChannel(imageData);
    const split = splitBlocks(gray, imageData.width, imageData.height, varianceThreshold, minBlockSize);
    const merged = mergeBlocks(gray, imageData.width, split.blocks, mergeThreshold);
    return {
      split,
      merged,
      overlay: renderSplitMergeMap(imageData, split.blocks, merged),
    };
  }, [imageData, varianceThreshold, minBlockSize, mergeThreshold]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>4진 트리 기반 분할합병</h2>
          <p className="summary">균일하지 않은 영역은 4등분하고 비슷한 이웃 블록은 다시 묶는 과정을 시각화합니다.</p>
        </div>
        <div className="foot-note">leaf = {result.split.blocks.length}, groups = {result.merged.length}</div>
      </div>

      <div className="control-card glass">
        <div className="control-grid">
          <div className="control">
            <label>분산 임계값</label>
            <input type="range" min="60" max="900" step="10" value={varianceThreshold} onChange={(e) => setVarianceThreshold(Number(e.target.value))} />
            <div className="value-chip">{varianceThreshold}</div>
          </div>
          <div className="control">
            <label>최소 블록</label>
            <input type="range" min="8" max="64" step="4" value={minBlockSize} onChange={(e) => setMinBlockSize(Number(e.target.value))} />
            <div className="value-chip">{minBlockSize}px</div>
          </div>
          <div className="control">
            <label>병합 임계값</label>
            <input type="range" min="5" max="45" step="1" value={mergeThreshold} onChange={(e) => setMergeThreshold(Number(e.target.value))} />
            <div className="value-chip">{mergeThreshold}</div>
          </div>
          <div className="control">
            <label>진행도</label>
            <input type="range" min="0.05" max="1" step="0.05" value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
            <div className="value-chip">{Math.round(progress * 100)}%</div>
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-6">
          <h3>분할합병 결과</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="input" />
            <ImageFrame title="overlay" src={result.overlay} meta={`${result.split.blocks.length} blocks`} />
          </div>
        </div>

        <div className="stage-card glass span-6">
          <h3>4진 트리 노드 맵</h3>
          <CanvasFrame width={560} height={280} draw={(canvas) => quad(canvas, result.split.steps, progress)} deps={[result.split, progress]} />
        </div>
      </div>
    </div>
  );
}

function MSTModule({ imageData }) {
  const [kValue, setKValue] = useState(350);
  const [progress, setProgress] = useState(0.45);
  const seg = useMemo(() => buildGraphSegmentation(imageData, kValue), [imageData, kValue]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>최소 신장 트리 기반 분할</h2>
          <p className="summary">가중치가 작은 edge부터 연결해 영역을 묶는 과정을 보여줍니다.</p>
        </div>
        <div className="foot-note">segments = {seg.segmentCount}, avg edge = {formatNumber(seg.averageEdge, 1)}</div>
      </div>

      <div className="control-card glass">
        <div className="control-grid">
          <div className="control">
            <label>k</label>
            <input type="range" min="50" max="900" step="10" value={kValue} onChange={(e) => setKValue(Number(e.target.value))} />
            <div className="value-chip">{kValue}</div>
          </div>
          <div className="control">
            <label>진행도</label>
            <input type="range" min="0.05" max="1" step="0.05" value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
            <div className="value-chip">{Math.round(progress * 100)}%</div>
          </div>
          <div className="control">
            <label>분할 경향</label>
            <div className="value-chip">{kValue < 250 ? '과분할' : kValue > 650 ? '큰 덩어리' : '중간'}</div>
          </div>
          <div className="control">
            <label>그래프 크기</label>
            <div className="value-chip">{seg.width} x {seg.height}</div>
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-6">
          <h3>그래프 연결 진행</h3>
          <CanvasFrame width={560} height={320} draw={(canvas) => graph(canvas, seg, progress)} deps={[seg, progress]} />
        </div>

        <div className="stage-card glass span-6">
          <h3>MST 미리보기</h3>
          <CanvasFrame width={560} height={320} draw={(canvas) => drawMstPreview(canvas, seg)} deps={[seg]} />
        </div>

        <div className="stage-card glass span-12">
          <h3>분할 결과</h3>
          <div className="mini-grid">
            <ImageFrame title="축소 입력" src={imageDataToDataUrl(seg.small)} meta={`${seg.width} x ${seg.height}`} />
            <ImageFrame title={`segmentation (k=${kValue})`} src={imageDataToDataUrl(seg.segmented)} meta={`${seg.segmentCount} segments`} />
          </div>
        </div>
      </div>
    </div>
  );
}
function App() {
  const presetList = useMemo(() => presets(), []);
  const [active, setActive] = useState('scale');
  const [selectedPreset, setSelectedPreset] = useState('sunflower');
  const [imageData, setImageData] = useState(presetList[0].imageData);
  const [sourceUrl, setSourceUrl] = useState(presetList[0].url);

  const usePreset = (id) => {
    const preset = presetList.find((item) => item.id === id);
    if (!preset) return;
    setSelectedPreset(id);
    setImageData(preset.imageData);
    setSourceUrl(preset.url);
  };

  const upload = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, 420 / img.width);
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const next = ctx.getImageData(0, 0, width, height);
        setImageData(next);
        setSourceUrl(canvas.toDataURL());
        setSelectedPreset('upload');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="app-shell">
      <section className="hero">
        <div className="hero-main glass">
          <div className="eyebrow">Computer Vision Interactive Lab</div>
          <h1>컴퓨터 비전 학습 시뮬레이터</h1>
          <p className="hero-copy">위치 찾기와 영상 분할 알고리즘을 같은 이미지에서 비교하며 중간 계산 과정까지 함께 살펴볼 수 있는 대시보드입니다.</p>
          <div className="hero-grid">
            <div className="hero-stat"><strong>2</strong> 상위 카테고리: 위치 찾기 / 영상 분할</div>
            <div className="hero-stat"><strong>8</strong> 하위 모듈: Scale, Harris, SIFT, SURF, Threshold, K-means, Split/Merge, MST</div>
            <div className="hero-stat"><strong>중간 과정</strong> 피라미드, DoG, 히스토그램, RGB 맵, 트리, 그래프를 함께 확인</div>
          </div>
        </div>

        <div className="hero-side glass">
          <div className="upload-box">
            <input type="file" accept="image/*" onChange={upload} />
            <strong style={{ fontSize: 22, marginBottom: 8, fontFamily: 'Space Grotesk, sans-serif' }}>이미지 업로드 또는 샘플 선택</strong>
            <p style={{ lineHeight: 1.7 }}>같은 입력 영상을 여러 알고리즘에 적용하면서 결과와 내부 계산을 나란히 비교할 수 있습니다.</p>
          </div>

          <div className="step-strip">
            {presetList.map((preset) => (
              <button key={preset.id} className={`tab-button ${selectedPreset === preset.id ? 'active' : ''}`} onClick={() => usePreset(preset.id)}>
                {preset.name}
                <span>{preset.note}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar glass">
          {GROUPS.map((group) => (
            <div key={group.id} style={{ marginBottom: 18 }}>
              <h3 style={{ margin: '0 0 10px' }}>{group.title}</h3>
              <div className="tab-row" style={{ margin: 0 }}>
                {group.modules.map((tab) => (
                  <button key={tab.id} className={`tab-button ${active === tab.id ? 'active' : ''}`} onClick={() => setActive(tab.id)}>
                    {tab.title}
                    <span>{tab.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="sidebar-note">기존 특징 검출과 영상 분할 내용을 함께 두고 사이드바에서 카테고리별로 나눠 볼 수 있게 구성했습니다.</div>
        </aside>

        <main className="content">
          {active === 'scale' && <ScaleModule imageData={imageData} sourceUrl={sourceUrl} />}
          {active === 'harris' && <HarrisModule imageData={imageData} sourceUrl={sourceUrl} />}
          {active === 'sift' && <SiftModule imageData={imageData} sourceUrl={sourceUrl} />}
          {active === 'surf' && <SurfModule imageData={imageData} sourceUrl={sourceUrl} />}
          {active === 'threshold' && <ThresholdModule imageData={imageData} sourceUrl={sourceUrl} />}
          {active === 'kmeans' && <KMeansModule imageData={imageData} sourceUrl={sourceUrl} />}
          {active === 'splitmerge' && <SplitMergeModule imageData={imageData} sourceUrl={sourceUrl} />}
          {active === 'mst' && <MSTModule imageData={imageData} />}
        </main>
      </section>
    </div>
  );
}

ReactDOM.createRoot(rootNode).render(<App />);
