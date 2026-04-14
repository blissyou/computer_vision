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

const MODULE_GROUPS = [
  {
    id: "feature",
    title: "위치 찾기 알고리즘",
    modules: [
      { id: "scale", title: "스케일 공간", subtitle: "가우시안 피라미드와 축소 비교" },
      { id: "harris", title: "해리스-라플라스", subtitle: "코너 응답과 스케일 선택" },
      { id: "sift", title: "SIFT", subtitle: "DoG 극점과 방향 할당" },
      { id: "surf", title: "SURF", subtitle: "필터 크기 확장 기반 접근" },
    ],
  },
  {
    id: "segmentation",
    title: "영상 분할 알고리즘",
    modules: [
      { id: "threshold", title: "임계화 분할", subtitle: "오츄, 삼진화, 적응형 비교" },
      { id: "kmeans", title: "K-means 분할", subtitle: "RGB 3D 산점도와 군집화" },
      { id: "splitmerge", title: "분할합병", subtitle: "4진 트리 기반 영역 분해" },
      { id: "mst", title: "최소 신장 트리", subtitle: "그래프 기반 분할과 k 조절" },
    ],
  },
];

function makePresetScene(kind) {
  const canvas = createCanvas(360, 240);
  const ctx = canvas.getContext("2d");

  if (kind === "sunflower") {
    const sky = ctx.createLinearGradient(0, 0, 0, 240);
    sky.addColorStop(0, "#7fc8f8");
    sky.addColorStop(0.55, "#b7e4c7");
    sky.addColorStop(1, "#5b8c5a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 360, 240);
    ctx.fillStyle = "#7c5c1b";
    ctx.fillRect(0, 140, 360, 100);
    for (let i = 0; i < 22; i += 1) {
      const x = 20 + (i % 11) * 31;
      const y = 125 + Math.floor(i / 11) * 52;
      ctx.strokeStyle = "#2d6a4f";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y + 25);
      ctx.lineTo(x, y + 65);
      ctx.stroke();
      ctx.fillStyle = "#5b3a1a";
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4d35e";
      for (let p = 0; p < 12; p += 1) {
        const angle = (Math.PI * 2 * p) / 12;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(angle) * 13, y + Math.sin(angle) * 13, 4, 8, angle, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (kind === "cell") {
    ctx.fillStyle = "#0e1726";
    ctx.fillRect(0, 0, 360, 240);
    for (let i = 0; i < 50; i += 1) {
      const x = 20 + ((i * 47) % 320);
      const y = 20 + ((i * 73) % 180);
      const r = 10 + (i % 5) * 7;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, "rgba(199, 249, 204, 0.95)");
      g.addColorStop(0.45, "rgba(128, 237, 153, 0.75)");
      g.addColorStop(1, "rgba(82, 183, 136, 0.15)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (kind === "beach") {
    const sky = ctx.createLinearGradient(0, 0, 0, 240);
    sky.addColorStop(0, "#90e0ef");
    sky.addColorStop(0.4, "#caf0f8");
    sky.addColorStop(0.41, "#00b4d8");
    sky.addColorStop(0.64, "#0077b6");
    sky.addColorStop(0.65, "#f1dca7");
    sky.addColorStop(1, "#d4a373");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 360, 240);
  }

  return ctx.getImageData(0, 0, 360, 240);
}

function buildPresetList() {
  return [
    { id: "sunflower", name: "해바라기 밭", note: "색상 군집과 전역 임계화 비교" },
    { id: "cell", name: "세포 현미경", note: "적응형 임계화와 과분할 관찰" },
    { id: "beach", name: "해변 풍경", note: "큰 영역 병합과 스케일 비교" },
  ].map((preset) => {
    const imageData = makePresetScene(preset.id);
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

function computeGradients(gray, width, height) {
  const ix = new Float32Array(gray.length);
  const iy = new Float32Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      ix[idx] = (gray[idx + 1] - gray[idx - 1]) * 0.5;
      iy[idx] = (gray[idx + width] - gray[idx - width]) * 0.5;
    }
  }
  return { ix, iy };
}

function computeHarrisResponse(gray, width, height, sigma) {
  const { ix, iy } = computeGradients(gray, width, height);
  const ixx = new Float32Array(gray.length);
  const iyy = new Float32Array(gray.length);
  const ixy = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    ixx[i] = ix[i] * ix[i];
    iyy[i] = iy[i] * iy[i];
    ixy[i] = ix[i] * iy[i];
  }
  const sxx = gaussianBlurGray(ixx, width, height, sigma);
  const syy = gaussianBlurGray(iyy, width, height, sigma);
  const sxy = gaussianBlurGray(ixy, width, height, sigma);
  const response = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    const det = sxx[i] * syy[i] - sxy[i] * sxy[i];
    const trace = sxx[i] + syy[i];
    response[i] = det - 0.04 * trace * trace;
  }
  return response;
}

function computeLaplacian(gray, width, height, sigma) {
  const blurred = gaussianBlurGray(gray, width, height, sigma);
  const lap = new Float32Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      lap[idx] = blurred[idx - 1] + blurred[idx + 1] + blurred[idx - width] + blurred[idx + width] - 4 * blurred[idx];
    }
  }
  return lap;
}

function normalizeImage(values, width, height, tint = [1, 1, 1]) {
  return imageDataToDataUrl(floatArrayToImageData(values, width, height, { grayscale: false, tint }));
}

function selectLocalMaxima(values, width, height, thresholdRatio = 0.12, maxPoints = 120) {
  let maxValue = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > maxValue) maxValue = values[i];
  }
  const threshold = maxValue * thresholdRatio;
  const points = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const value = values[idx];
      if (value < threshold) continue;
      let isPeak = true;
      for (let dy = -1; dy <= 1 && isPeak; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (values[(y + dy) * width + (x + dx)] >= value) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak) points.push({ x, y, value });
    }
  }
  return sampleEvery(points.sort((a, b) => b.value - a.value), maxPoints);
}

function drawOverlayPoints(imageData, points, radiusFn, color, withOrientation = false) {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  points.forEach((point) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radiusFn(point), 0, Math.PI * 2);
    ctx.stroke();
    if (withOrientation && point.angle !== undefined) {
      const len = 6 + Math.min(10, point.magnitude * 0.15);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + Math.cos(point.angle) * len, point.y + Math.sin(point.angle) * len);
      ctx.stroke();
    }
  });
  return canvas.toDataURL();
}

function buildHarrisLaplace(imageData) {
  const scaleSpace = buildScaleSpace(imageData);
  const octave = scaleSpace.octaveImages[0];
  const layers = octave.slice(0, 4).map((level) => {
    const response = computeHarrisResponse(level.data, level.width, level.height, Math.max(1.2, level.sigma));
    const laplacian = computeLaplacian(level.data, level.width, level.height, Math.max(1.2, level.sigma));
    return {
      sigma: level.sigma,
      width: level.width,
      height: level.height,
      response,
      laplacian,
      preview: normalizeImage(response, level.width, level.height, [0.9, 1.2, 1.1]),
    };
  });

  const points = [];
  for (let layerIndex = 1; layerIndex < layers.length - 1; layerIndex += 1) {
    const peaks = selectLocalMaxima(layers[layerIndex].response, layers[layerIndex].width, layers[layerIndex].height, 0.18, 60);
    peaks.forEach((peak) => {
      const idx = peak.y * layers[layerIndex].width + peak.x;
      const current = Math.abs(layers[layerIndex].laplacian[idx]);
      const below = Math.abs(layers[layerIndex - 1].laplacian[idx]);
      const above = Math.abs(layers[layerIndex + 1].laplacian[idx]);
      if (current >= below && current >= above) points.push({ ...peak, layerIndex, sigma: layers[layerIndex].sigma });
    });
  }

  return {
    layers,
    points: sampleEvery(points, 80),
    overlay: drawOverlayPoints(imageData, points, (p) => 4 + p.layerIndex * 1.4, "#66d9c3"),
  };
}

function computeOrientationPoints(imageData, points) {
  const gray = getGrayChannel(imageData);
  const { ix, iy } = computeGradients(gray, imageData.width, imageData.height);
  return points.map((point) => {
    const idx = point.y * imageData.width + point.x;
    return {
      ...point,
      angle: Math.atan2(iy[idx], ix[idx]),
      magnitude: Math.sqrt(ix[idx] * ix[idx] + iy[idx] * iy[idx]),
    };
  });
}

function buildSurfResponses(imageData) {
  const gray = getGrayChannel(imageData);
  return [9, 15, 21, 27].map((size) => {
    const radius = Math.max(1, Math.floor(size / 6));
    const smooth = boxBlurGray(gray, imageData.width, imageData.height, radius);
    const detApprox = subtractArrays(gray, smooth);
    return {
      size,
      preview: normalizeImage(detApprox, imageData.width, imageData.height, [1.0, 1.15, 1.3]),
      strength: Math.max(...Array.from(detApprox).map((v) => Math.abs(v))).toFixed(1),
    };
  });
}

function adaptiveTriThreshold(gray, width, height, t1, t2) {
  const localMean = boxBlurGray(gray, width, height, 5);
  const lowOffset = (128 - t1) * 0.45;
  const highOffset = (t2 - 128) * 0.45;
  const out = new ImageData(width, height);
  const palette = [
    [16, 29, 60],
    [102, 217, 195],
    [255, 184, 107],
  ];
  for (let i = 0; i < gray.length; i += 1) {
    const lower = localMean[i] - lowOffset;
    const upper = localMean[i] + highOffset;
    const label = gray[i] < lower ? 0 : gray[i] < upper ? 1 : 2;
    const base = i * 4;
    out.data[base] = palette[label][0];
    out.data[base + 1] = palette[label][1];
    out.data[base + 2] = palette[label][2];
    out.data[base + 3] = 255;
  }
  return out;
}

function drawQuadTreeMap(canvas, steps, progress) {
  const ctx = canvas.getContext("2d");
  const visible = steps.slice(0, Math.max(1, Math.floor(steps.length * progress)));
  const levels = {};
  visible.forEach((step) => {
    if (!levels[step.depth]) levels[step.depth] = [];
    levels[step.depth].push(step);
  });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#09111f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  Object.keys(levels)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((depth) => {
      levels[depth].forEach((node, index) => {
        const x = ((index + 1) / (levels[depth].length + 1)) * canvas.width;
        const y = 36 + depth * 62;
        ctx.fillStyle = node.action === "split" ? "rgba(255,184,107,0.85)" : "rgba(102,217,195,0.88)";
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.font = "11px sans-serif";
        ctx.fillText(`${node.size}px`, x - 14, y + 20);
      });
    });
}

function drawImageGraph(canvas, graphSegmentation, progress) {
  const { width, height, mstEdges } = graphSegmentation;
  const ctx = canvas.getContext("2d");
  const sx = canvas.width / width;
  const sy = canvas.height / height;
  const edges = sampleEvery(mstEdges.slice(0, Math.max(1, Math.floor(mstEdges.length * progress))), 260);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#081221";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let x = 0; x <= width; x += 2) {
    ctx.beginPath();
    ctx.moveTo(x * sx, 0);
    ctx.lineTo(x * sx, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 2) {
    ctx.beginPath();
    ctx.moveTo(0, y * sy);
    ctx.lineTo(canvas.width, y * sy);
    ctx.stroke();
  }
  edges.forEach((edge, index) => {
    const ax = (edge.a % width) * sx + sx / 2;
    const ay = Math.floor(edge.a / width) * sy + sy / 2;
    const bx = (edge.b % width) * sx + sx / 2;
    const by = Math.floor(edge.b / width) * sy + sy / 2;
    ctx.strokeStyle = `hsla(${180 + (index % 100)}, 80%, 70%, 0.45)`;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  });
}

function PlotlyScatter({ points, centroids, stage }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.Plotly) return;
    const visiblePoints = stage === 0 ? sampleEvery(points, 180) : points;
    const traces = [
      {
        x: visiblePoints.map((p) => p.rgb[0]),
        y: visiblePoints.map((p) => p.rgb[1]),
        z: visiblePoints.map((p) => p.rgb[2]),
        mode: "markers",
        type: "scatter3d",
        marker: {
          size: 3,
          color: stage >= 2 ? visiblePoints.map((p) => p.cluster) : visiblePoints.map((p) => `rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})`),
          colorscale: "Viridis",
          opacity: 0.72,
        },
        name: "pixels",
      },
    ];
    if (stage >= 1) {
      traces.push({
        x: centroids.map((c) => c[0]),
        y: centroids.map((c) => c[1]),
        z: centroids.map((c) => c[2]),
        mode: "markers",
        type: "scatter3d",
        marker: { size: 8, color: "#ffffff", line: { color: "#00d4ff", width: 2 } },
        name: "centroids",
      });
    }
    window.Plotly.react(
      ref.current,
      traces,
      {
        margin: { l: 0, r: 0, b: 0, t: 10 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        scene: {
          xaxis: { title: "R", color: "#dbeafe", gridcolor: "rgba(255,255,255,0.1)" },
          yaxis: { title: "G", color: "#dbeafe", gridcolor: "rgba(255,255,255,0.1)" },
          zaxis: { title: "B", color: "#dbeafe", gridcolor: "rgba(255,255,255,0.1)" },
          bgcolor: "rgba(0,0,0,0)",
          camera: { eye: { x: 1.35, y: 1.25, z: 0.9 } },
        },
        showlegend: false,
      },
      { displayModeBar: false, responsive: true }
    );
  }, [points, centroids, stage]);
  return <div ref={ref} className="chart-surface" style={{ height: 340 }} />;
}

function ScaleSpaceModule({ imageData, sourceUrl }) {
  const [sigma, setSigma] = useState(1.8);
  const [ratio, setRatio] = useState(0.1);
  const analysis = useMemo(() => {
    const gray = getGrayChannel(imageData);
    const blurred = gaussianBlurGray(gray, imageData.width, imageData.height, sigma);
    const downscaled = resizeImageData(imageData, ratio);
    return {
      blurUrl: imageDataToDataUrl(floatArrayToImageData(blurred, imageData.width, imageData.height)),
      downscaledUrl: imageDataToDataUrl(downscaled),
      scaleSpace: buildScaleSpace(imageData),
    };
  }, [imageData, sigma, ratio]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>스케일 공간 시뮬레이터</h2>
          <p className="summary">이미지를 축소하고 sigma를 조절하면서 디테일이 어떻게 사라지는지, 그리고 가우시안 피라미드가 어떻게 형성되는지 보여줍니다.</p>
        </div>
        <div className="foot-note">한 옥타브당 6장의 가우시안 영상<br />다음 옥타브는 1/2 크기에서 시작</div>
      </div>
      <div className="control-card glass">
        <div className="control-grid">
          <div className="control"><label>가우시안 sigma</label><input type="range" min="0.6" max="4.2" step="0.1" value={sigma} onChange={(e) => setSigma(Number(e.target.value))} /><div className="value-chip">sigma = {formatNumber(sigma, 1)}</div></div>
          <div className="control"><label>축소 비율</label><input type="range" min="0.1" max="0.5" step="0.05" value={ratio} onChange={(e) => setRatio(Number(e.target.value))} /><div className="value-chip">scale = {formatNumber(ratio, 2)}</div></div>
          <div className="control"><label>옥타브</label><div className="value-chip">2</div></div>
          <div className="control"><label>레벨</label><div className="value-chip">6 Gaussian levels</div></div>
        </div>
      </div>
      <div className="panel-grid">
        <div className="stage-card glass span-7">
          <h3>스케일 변화 효과</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta={`${imageData.width} x ${imageData.height}`} />
            <ImageFrame title="축소 영상" src={analysis.downscaledUrl} meta={`${formatNumber(ratio, 2)}x`} />
            <ImageFrame title="가우시안 블러" src={analysis.blurUrl} meta={`sigma ${formatNumber(sigma, 1)}`} />
          </div>
        </div>
        <div className="stage-card glass span-5">
          <h3>학습 포인트</h3>
          <div className="metrics-row">
            <div className="metric"><strong>Scale</strong>크기 변화에 대응</div>
            <div className="metric"><strong>Octave</strong>다중 해상도 구성</div>
            <div className="metric"><strong>Sigma</strong>평활화 정도 조절</div>
          </div>
        </div>
        <div className="stage-card glass span-12">
          <h3>가우시안 피라미드</h3>
          {analysis.scaleSpace.octaveImages.map((octave, octaveIndex) => (
            <div key={`oct-${octaveIndex}`} style={{ marginBottom: 18 }}>
              <div className="image-caption" style={{ marginBottom: 10 }}>
                <strong>{`옥타브 ${octaveIndex + 1}`}</strong>
                <span>{`${octave[0].width} x ${octave[0].height}`}</span>
              </div>
              <div className="mini-grid">
                {octave.map((level, idx) => <ImageFrame key={`g-${octaveIndex}-${idx}`} title={`G${idx + 1}`} src={level.url} meta={`sigma ${formatNumber(level.sigma, 2)}`} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HarrisLaplaceModule({ imageData, sourceUrl }) {
  const analysis = useMemo(() => buildHarrisLaplace(imageData), [imageData]);
  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>해리스-라플라스 시뮬레이터</h2>
          <p className="summary">Harris 코너 응답으로 위치 후보를 찾고, Laplacian 응답이 가장 큰 스케일을 골라 스케일 불변 특징점을 선택합니다.</p>
        </div>
        <div className="foot-note">Harris로 코너 후보 검출<br />Laplacian으로 스케일 선택</div>
      </div>
      <div className="panel-grid">
        <div className="stage-card glass span-5">
          <h3>최종 특징점</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="input" />
            <ImageFrame title="Harris-Laplace" src={analysis.overlay} meta={`${analysis.points.length} keypoints`} />
          </div>
        </div>
        <div className="stage-card glass span-7">
          <h3>스케일별 Harris 응답</h3>
          <div className="mini-grid">
            {analysis.layers.map((layer, index) => <ImageFrame key={`h-${index}`} title={`sigma ${formatNumber(layer.sigma, 2)}`} src={layer.preview} meta={`layer ${index + 1}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SiftModule({ imageData, sourceUrl }) {
  const analysis = useMemo(() => {
    const scaleSpace = buildScaleSpace(imageData);
    const dogs = scaleSpace.dogImages[0];
    const keypoints = findKeypointsFromDogs(dogs, dogs[0].width, dogs[0].height, 14);
    const oriented = computeOrientationPoints(imageData, keypoints.slice(0, 70));
    return {
      dogs,
      keypoints,
      overlay: drawKeypointsOverlay(imageData, keypoints, 1),
      orientationOverlay: drawOverlayPoints(imageData, oriented, () => 3.5, "#ffb86b", true),
    };
  }, [imageData]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>SIFT 시뮬레이터</h2>
          <p className="summary">DoG 극점을 검출하고, 각 특징점 주변의 주 방향을 할당해 회전 변화에도 비교적 강한 표현을 만드는 과정을 보여줍니다.</p>
        </div>
        <div className="foot-note">DoG 극점 검출<br />방향 할당</div>
      </div>
      <div className="panel-grid">
        <div className="stage-card glass span-5">
          <h3>DoG 특징점</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="input" />
            <ImageFrame title="DoG 키포인트" src={analysis.overlay} meta={`${analysis.keypoints.length} points`} />
          </div>
        </div>
        <div className="stage-card glass span-7">
          <h3>주 방향 부여</h3>
          <ImageFrame title="방향 오버레이" src={analysis.orientationOverlay} meta="회전 불변성 설명" />
        </div>
        <div className="stage-card glass span-12">
          <h3>DoG 차영상 배열</h3>
          <div className="mini-grid">
            {analysis.dogs.map((dog, index) => <ImageFrame key={`dog-${index}`} title={`DoG ${index + 1}`} src={dog.url} meta={`slice ${index + 1}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SurfModule({ imageData, sourceUrl }) {
  const responses = useMemo(() => buildSurfResponses(imageData), [imageData]);
  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>SURF 시뮬레이터</h2>
          <p className="summary">이미지를 계속 줄이는 대신 필터 크기를 키우며 큰 구조를 보는 SURF 방식의 직관을 보여줍니다.</p>
        </div>
        <div className="foot-note">이미지 축소 대신 필터 확장<br />빠른 Hessian 근사</div>
      </div>
      <div className="panel-grid">
        <div className="stage-card glass span-4">
          <h3>원본 영상</h3>
          <ImageFrame title="입력" src={sourceUrl} meta={`${imageData.width} x ${imageData.height}`} />
        </div>
        <div className="stage-card glass span-8">
          <h3>필터 크기 변화</h3>
          <div className="mini-grid">
            {responses.map((item) => <ImageFrame key={`surf-${item.size}`} title={`${item.size} x ${item.size}`} src={item.preview} meta={`strength ${item.strength}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThresholdModule({ imageData, sourceUrl }) {
  const gray = useMemo(() => getGrayChannel(imageData), [imageData]);
  const histogram = useMemo(() => buildHistogram(gray), [gray]);
  const otsu = useMemo(() => computeMultiOtsu(histogram, gray.length), [histogram, gray.length]);
  const [t1, setT1] = useState(otsu.t1);
  const [t2, setT2] = useState(otsu.t2);
  const [mode, setMode] = useState("global");

  useEffect(() => {
    setT1(otsu.t1);
    setT2(otsu.t2);
  }, [otsu.t1, otsu.t2]);

  const segmented = useMemo(() => {
    const safeT1 = Math.min(t1, t2 - 1);
    const safeT2 = Math.max(t2, safeT1 + 1);
    return mode === "global"
      ? applyTriThreshold(gray, imageData.width, imageData.height, safeT1, safeT2)
      : adaptiveTriThreshold(gray, imageData.width, imageData.height, safeT1, safeT2);
  }, [gray, imageData, t1, t2, mode]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>모듈 A. 임계화를 이용한 분할</h2>
          <p className="summary">이중 임계값 오츄와 적응형 임계화를 비교하면서 삼진 영상이 어떻게 만들어지는지 살펴볼 수 있습니다.</p>
        </div>
        <div className="foot-note">추천 오츄 임계값: t1 = {otsu.t1}, t2 = {otsu.t2}<br />현재 방식: {mode === "global" ? "전역 임계화" : "적응적 임계화"}</div>
      </div>
      <div className="control-card glass">
        <div className="control-grid">
          <div className="control"><label>임계값 t1</label><input type="range" min="0" max="254" value={t1} onChange={(e) => setT1(Number(e.target.value))} /><div className="value-chip">t1 = {t1}</div></div>
          <div className="control"><label>임계값 t2</label><input type="range" min="1" max="255" value={t2} onChange={(e) => setT2(Number(e.target.value))} /><div className="value-chip">t2 = {t2}</div></div>
          <div className="control"><label>비교 토글</label><button className={`tab-button ${mode === "global" ? "active" : ""}`} onClick={() => setMode(mode === "global" ? "adaptive" : "global")}>{mode === "global" ? "전역 임계화" : "적응적 임계화"}<span>클릭해서 방식 전환</span></button></div>
          <div className="control"><label>출력 형태</label><div className="value-chip">0 / 1 / 2 삼진 영상</div></div>
        </div>
      </div>
      <div className="panel-grid">
        <div className="stage-card glass span-7">
          <h3>명암 히스토그램</h3>
          <CanvasFrame width={760} height={240} draw={(canvas) => drawHistogram(canvas, histogram, Math.min(t1, t2 - 1), Math.max(t2, t1 + 1))} deps={[histogram, t1, t2]} />
        </div>
        <div className="stage-card glass span-5">
          <h3>분할 결과 비교</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="입력 영상" />
            <ImageFrame title={mode === "global" ? "전역 임계화" : "적응적 임계화"} src={imageDataToDataUrl(segmented)} meta="삼진 결과" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KMeansModule({ imageData, sourceUrl }) {
  const [k, setK] = useState(4);
  const [stage, setStage] = useState(0);
  const kmeans = useMemo(() => runKMeans(imageData, k, 8), [imageData, k]);
  const initialCentroids = useMemo(() => sampleEvery(kmeans.scatterPoints, k).map((p) => p.rgb), [kmeans, k]);

  useEffect(() => {
    setStage(0);
    const timers = [1, 2, 3].map((nextStage, index) => setTimeout(() => setStage(nextStage), 700 * (index + 1)));
    return () => timers.forEach(clearTimeout);
  }, [k]);

  const stageLabel = stage === 0 ? "샘플 픽셀 배치" : stage === 1 ? "중심점 초기화" : stage === 2 ? "가장 가까운 중심점에 배정" : "최종 군집화 완료";

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>모듈 B. K-means 컬러 군집화</h2>
          <p className="summary">RGB 공간에 픽셀을 점으로 올리고, 중심점 초기화부터 최종 군집화 완료까지 과정을 단계별로 시각화합니다.</p>
        </div>
        <div className="foot-note">현재 군집 수 k = {k}<br />진행 단계: {stageLabel}</div>
      </div>
      <div className="control-card glass">
        <div className="control-grid">
          <div className="control"><label>군집 수 k</label><input type="range" min="2" max="8" value={k} onChange={(e) => setK(Number(e.target.value))} /><div className="value-chip">k = {k}</div></div>
          <div className="control"><label>단계</label><div className="value-chip">{stageLabel}</div></div>
          <div className="control"><label>초기 중심점</label><div className="value-chip">{initialCentroids.length}개</div></div>
          <div className="control"><label>최종 중심점</label><div className="value-chip">{kmeans.centroids.length}개</div></div>
        </div>
      </div>
      <div className="panel-grid">
        <div className="stage-card glass span-7">
          <h3>RGB 3D 산점도</h3>
          <PlotlyScatter points={kmeans.scatterPoints} centroids={stage >= 3 ? kmeans.centroids : initialCentroids} stage={stage} />
        </div>
        <div className="stage-card glass span-5">
          <h3>군집화 결과 영상</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="컬러 영상" />
            <ImageFrame title={`K-means 결과 (k=${k})`} src={imageDataToDataUrl(kmeans.segmented)} meta={stageLabel} />
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
    return { split, merged, overlay: renderSplitMergeMap(imageData, split.blocks, merged) };
  }, [imageData, varianceThreshold, minBlockSize, mergeThreshold]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>모듈 C. 4진 트리 기반 분할합병</h2>
          <p className="summary">균일하지 않은 영역은 4등분하고, 비슷한 이웃 영역은 다시 병합하는 과정을 4진 트리 노드 맵과 함께 보여줍니다.</p>
        </div>
        <div className="foot-note">리프 수: {result.split.blocks.length}<br />병합 그룹 수: {result.merged.length}</div>
      </div>
      <div className="control-card glass">
        <div className="control-grid">
          <div className="control"><label>균일성 분산 임계값</label><input type="range" min="60" max="900" step="10" value={varianceThreshold} onChange={(e) => setVarianceThreshold(Number(e.target.value))} /><div className="value-chip">{varianceThreshold}</div></div>
          <div className="control"><label>최소 블록 크기</label><input type="range" min="8" max="64" step="4" value={minBlockSize} onChange={(e) => setMinBlockSize(Number(e.target.value))} /><div className="value-chip">{minBlockSize}px</div></div>
          <div className="control"><label>병합 유사도 임계값</label><input type="range" min="5" max="45" step="1" value={mergeThreshold} onChange={(e) => setMergeThreshold(Number(e.target.value))} /><div className="value-chip">{mergeThreshold}</div></div>
          <div className="control"><label>과정 진행도</label><input type="range" min="0.05" max="1" step="0.05" value={progress} onChange={(e) => setProgress(Number(e.target.value))} /><div className="value-chip">{Math.round(progress * 100)}%</div></div>
        </div>
      </div>
      <div className="panel-grid">
        <div className="stage-card glass span-6">
          <h3>영역 분할 및 병합 결과</h3>
          <div className="mini-grid">
            <ImageFrame title="원본" src={sourceUrl} meta="입력 영상" />
            <ImageFrame title="분할합병 오버레이" src={result.overlay} meta={`${result.split.blocks.length} leaves`} />
          </div>
        </div>
        <div className="stage-card glass span-6">
          <h3>4진 트리 노드 맵</h3>
          <CanvasFrame width={560} height={280} draw={(canvas) => drawQuadTreeMap(canvas, result.split.steps, progress)} deps={[result.split, progress]} />
        </div>
      </div>
    </div>
  );
}

function MSTModule({ imageData }) {
  const [kValue, setKValue] = useState(350);
  const [progress, setProgress] = useState(0.45);
  const graphSegmentation = useMemo(() => buildGraphSegmentation(imageData, kValue), [imageData, kValue]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>모듈 D. 최소 신장 트리 기반 분할</h2>
          <p className="summary">컬러 차이를 edge 가중치로 둔 그래프를 만들고, 작은 edge부터 탐욕적으로 연결하며 영역을 병합하는 과정을 보여줍니다.</p>
        </div>
        <div className="foot-note">최종 세그먼트 수: {graphSegmentation.segmentCount}<br />평균 선택 edge: {formatNumber(graphSegmentation.averageEdge, 1)}</div>
      </div>
      <div className="control-card glass">
        <div className="control-grid">
          <div className="control"><label>세밀함 매개변수 k</label><input type="range" min="50" max="900" step="10" value={kValue} onChange={(e) => setKValue(Number(e.target.value))} /><div className="value-chip">k = {kValue}</div></div>
          <div className="control"><label>탐욕 알고리즘 진행도</label><input type="range" min="0.05" max="1" step="0.05" value={progress} onChange={(e) => setProgress(Number(e.target.value))} /><div className="value-chip">{Math.round(progress * 100)}%</div></div>
          <div className="control"><label>분할 경향</label><div className="value-chip">{kValue < 250 ? "과분할 쪽" : kValue > 650 ? "큰 덩어리 분할" : "중간 분할"}</div></div>
          <div className="control"><label>그래프 해상도</label><div className="value-chip">{graphSegmentation.width} x {graphSegmentation.height}</div></div>
        </div>
      </div>
      <div className="panel-grid">
        <div className="stage-card glass span-6">
          <h3>그래프 구성과 탐욕적 연결</h3>
          <CanvasFrame width={560} height={320} draw={(canvas) => drawImageGraph(canvas, graphSegmentation, progress)} deps={[graphSegmentation, progress]} />
        </div>
        <div className="stage-card glass span-6">
          <h3>MST 미리보기</h3>
          <CanvasFrame width={560} height={320} draw={(canvas) => drawMstPreview(canvas, graphSegmentation)} deps={[graphSegmentation]} />
        </div>
        <div className="stage-card glass span-12">
          <h3>k 값에 따른 분할 결과</h3>
          <div className="mini-grid">
            <ImageFrame title="그래프용 축소 영상" src={imageDataToDataUrl(graphSegmentation.small)} meta={`${graphSegmentation.width} x ${graphSegmentation.height}`} />
            <ImageFrame title={`최종 분할 결과 (k=${kValue})`} src={imageDataToDataUrl(graphSegmentation.segmented)} meta={`${graphSegmentation.segmentCount} segments`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const presets = useMemo(() => buildPresetList(), []);
  const [activeModule, setActiveModule] = useState("scale");
  const [selectedPreset, setSelectedPreset] = useState("sunflower");
  const [imageData, setImageData] = useState(presets[0].imageData);
  const [sourceUrl, setSourceUrl] = useState(presets[0].url);

  function applyPreset(presetId) {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedPreset(presetId);
    setImageData(preset.imageData);
    setSourceUrl(preset.url);
  }

  function handleUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 420;
        const ratio = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const next = ctx.getImageData(0, 0, width, height);
        setImageData(next);
        setSourceUrl(canvas.toDataURL());
        setSelectedPreset("upload");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="app-shell">
      <section className="hero">
        <div className="hero-main glass">
          <div className="eyebrow">Computer Vision Interactive Lab</div>
          <h1>컴퓨터 비전 학습 시뮬레이터</h1>
          <p className="hero-copy">기존 위치 찾기 알고리즘과 새 영상 분할 알고리즘을 하나의 대시보드 안에서 함께 탐색할 수 있게 구성했습니다.</p>
          <div className="hero-grid">
            <div className="hero-stat"><strong>2</strong>상위 카테고리: 위치 찾기 / 영상 분할</div>
            <div className="hero-stat"><strong>8</strong>하위 모듈: Scale, Harris, SIFT, SURF, Threshold, K-means, Split/Merge, MST</div>
            <div className="hero-stat"><strong>중간 과정</strong>피라미드, DoG, 히스토그램, RGB 맵, 트리, 그래프를 계속 노출</div>
          </div>
        </div>

        <div className="hero-side glass">
          <div className="upload-box">
            <input type="file" accept="image/*" onChange={handleUpload} />
            <strong style={{ fontSize: 22, marginBottom: 8, fontFamily: "Space Grotesk, sans-serif" }}>이미지 업로드 또는 샘플 프리셋 선택</strong>
            <p style={{ lineHeight: 1.7 }}>위치 찾기 알고리즘과 영상 분할 알고리즘을 같은 입력 이미지로 비교 학습할 수 있습니다.</p>
          </div>
          <div className="step-strip">
            {presets.map((preset) => (
              <button key={preset.id} className={`tab-button ${selectedPreset === preset.id ? "active" : ""}`} onClick={() => applyPreset(preset.id)}>
                {preset.name}
                <span>{preset.note}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="sidebar glass">
          {MODULE_GROUPS.map((group) => (
            <div key={group.id} style={{ marginBottom: 18 }}>
              <h3 style={{ margin: "0 0 10px" }}>{group.title}</h3>
              <div className="tab-row" style={{ margin: 0 }}>
                {group.modules.map((tab) => (
                  <button key={tab.id} className={`tab-button ${activeModule === tab.id ? "active" : ""}`} onClick={() => setActiveModule(tab.id)}>
                    {tab.title}
                    <span>{tab.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="sidebar-note">기존 특징점 쪽 내용과 새 분할 내용이 함께 살아 있고, 사이드바에서 카테고리별로 나눠 볼 수 있습니다.</div>
        </aside>

        <main className="content">
          {activeModule === "scale" && <ScaleSpaceModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeModule === "harris" && <HarrisLaplaceModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeModule === "sift" && <SiftModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeModule === "surf" && <SurfModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeModule === "threshold" && <ThresholdModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeModule === "kmeans" && <KMeansModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeModule === "splitmerge" && <SplitMergeModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeModule === "mst" && <MSTModule imageData={imageData} />}
        </main>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
