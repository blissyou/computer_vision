const { useEffect, useMemo, useRef, useState } = React;

const {
  formatNumber,
  imageDataToDataUrl,
  getGrayChannel,
  resizeImageData,
  generateDemoImageData,
  gaussianBlurGray,
  floatArrayToImageData,
  buildScaleSpace,
  findKeypointsFromDogs,
  drawKeypointsOverlay,
  boxBlurGray,
  subtractArrays,
  sampleEvery,
} = window.CVUtils;

const COPY = {
  title: "\uc704\uce58 \ucc3e\uae30 \uc54c\uace0\ub9ac\uc998 \uc2dc\ubbac\ub808\uc774\ud130",
  subtitle:
    "\uc2a4\ucf00\uc77c \ubd88\ubcc0 \ud2b9\uc9d5\uc810 \uac80\ucd9c\uc744 \uc911\uc2ec\uc73c\ub85c \uc2a4\ucf00\uc77c \uacf5\uac04, \ud574\ub9ac\uc2a4-\ub77c\ud50c\ub77c\uc2a4, SIFT, SURF\ub97c \uc2dc\uac01\ud654\ud569\ub2c8\ub2e4.",
  uploadTitle: "\uc774\ubbf8\uc9c0\ub97c \uc62c\ub9ac\uace0 \ud2b9\uc9d5\uc810\uc774 \uc7a1\ud788\ub294 \uacfc\uc815\uc744 \ubcf4\uc138\uc694",
  uploadBody:
    "\uacb0\uacfc \ud55c \uc7a5\ub9cc \ubcf4\uc5ec\uc8fc\ub294 \ub300\uc2e0, \uc2a4\ucf00\uc77c \uacf5\uac04 \uc0dd\uc131, \ucf54\ub108 \uc751\ub2f5, DoG \uadf9\uc810, \ud544\ud130 \ud06c\uae30 \ubcc0\ud654\ub97c \ub2e8\uacc4\ubcc4\ub85c \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
  moduleLabel: "\uc54c\uace0\ub9ac\uc998 \ubaa8\ub4c8",
  sideNote:
    "\uba3c\uc800 \uc2a4\ucf00\uc77c \uacf5\uac04\uc5d0\uc11c \ud53c\ub77c\ubbf8\ub4dc\uac00 \uc5b4\ub5bb\uac8c \uc30d\uc774\ub294\uc9c0 \ubcf4\uace0, \uadf8 \ub2e4\uc74c \ud574\ub9ac\uc2a4-\ub77c\ud50c\ub77c\uc2a4\uc640 SIFT\ub85c \ud2b9\uc9d5\uc810 \uc120\ud0dd\uc744 \ube44\uad50\ud55c \ub4a4, \ub9c8\uc9c0\ub9c9\uc73c\ub85c SURF\uc758 \ud544\ud130 \ud655\uc7a5 \uc811\uadfc\uc744 \uc0b4\ud3b4\ubcf4\uc138\uc694.",
};

const TABS = [
  {
    id: "scale",
    title: "\uc2a4\ucf00\uc77c \uacf5\uac04",
    subtitle: "\uac00\uc6b0\uc2dc\uc548 \ud53c\ub77c\ubbf8\ub4dc\uc640 \ucd95\uc18c \ube44\uad50",
  },
  {
    id: "harris",
    title: "\ud574\ub9ac\uc2a4-\ub77c\ud50c\ub77c\uc2a4",
    subtitle: "\ucf54\ub108 \uc751\ub2f5 + \uc2a4\ucf00\uc77c \uc120\ud0dd",
  },
  {
    id: "sift",
    title: "SIFT",
    subtitle: "DoG \uadf9\uc810 \uac80\ucd9c\uacfc \uc8fc\uc694 \ubc29\ud5a5",
  },
  {
    id: "surf",
    title: "SURF",
    subtitle: "\ubc15\uc2a4 \ud544\ud130 \ud06c\uae30 \ud655\uc7a5",
  },
];

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawImageData(imageData) {
  return imageDataToDataUrl(imageData);
}

function CanvasFrame({ width, height, draw, deps = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current);
  }, deps);

  return <canvas className="chart-surface" ref={canvasRef} width={width} height={height} />;
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

function normalizeToImage(values, width, height, tint) {
  return drawImageData(floatArrayToImageData(values, width, height, { grayscale: false, tint }));
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

function computeLaplacian(gray, width, height, sigma) {
  const blurred = gaussianBlurGray(gray, width, height, sigma);
  const lap = new Float32Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      lap[idx] =
        blurred[idx - 1] + blurred[idx + 1] + blurred[idx - width] + blurred[idx + width] - 4 * blurred[idx];
    }
  }
  return lap;
}

function buildHarrisLaplace(imageData) {
  const scaleSpace = buildScaleSpace(imageData);
  const octave = scaleSpace.octaveImages[0];
  const harrisLayers = octave.slice(0, 4).map((level) => {
    const response = computeHarrisResponse(level.data, level.width, level.height, Math.max(1.2, level.sigma));
    const laplacian = computeLaplacian(level.data, level.width, level.height, Math.max(1.2, level.sigma));
    return {
      sigma: level.sigma,
      width: level.width,
      height: level.height,
      response,
      laplacian,
      preview: normalizeToImage(response, level.width, level.height, [0.9, 1.2, 1.1]),
    };
  });

  const points = [];
  for (let layerIndex = 1; layerIndex < harrisLayers.length - 1; layerIndex += 1) {
    const layer = harrisLayers[layerIndex];
    const peaks = selectLocalMaxima(layer.response, layer.width, layer.height, 0.18, 60);
    peaks.forEach((peak) => {
      const idx = peak.y * layer.width + peak.x;
      const current = Math.abs(layer.laplacian[idx]);
      const below = Math.abs(harrisLayers[layerIndex - 1].laplacian[idx]);
      const above = Math.abs(harrisLayers[layerIndex + 1].laplacian[idx]);
      if (current >= below && current >= above) {
        points.push({ ...peak, sigma: layer.sigma, layerIndex });
      }
    });
  }

  const overlay = drawOverlayPoints(imageData, points, (p) => 4 + p.layerIndex * 1.4, "#66d9c3");
  return { harrisLayers, points: sampleEvery(points, 80), overlay };
}

function drawOverlayPoints(imageData, points, radiusFn, color) {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  points.forEach((point) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radiusFn(point), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x - 2, point.y);
    ctx.lineTo(point.x + 2, point.y);
    ctx.moveTo(point.x, point.y - 2);
    ctx.lineTo(point.x, point.y + 2);
    ctx.stroke();
  });
  return canvas.toDataURL();
}

function computeOrientationMap(gray, width, height, points) {
  const { ix, iy } = computeGradients(gray, width, height);
  return points.map((point) => {
    const idx = point.y * width + point.x;
    const angle = Math.atan2(iy[idx], ix[idx]);
    const magnitude = Math.sqrt(ix[idx] * ix[idx] + iy[idx] * iy[idx]);
    return { ...point, angle, magnitude };
  });
}

function drawOrientationOverlay(imageData, orientedPoints) {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  orientedPoints.forEach((point) => {
    const len = 6 + Math.min(10, point.magnitude * 0.15);
    const dx = Math.cos(point.angle) * len;
    const dy = Math.sin(point.angle) * len;
    ctx.strokeStyle = "#ffb86b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + dx, point.y + dy);
    ctx.stroke();
  });
  return canvas.toDataURL();
}

function buildSurfResponses(imageData) {
  const gray = getGrayChannel(imageData);
  const sizes = [9, 15, 21, 27];
  return sizes.map((size) => {
    const radius = Math.max(1, Math.floor(size / 6));
    const smooth = boxBlurGray(gray, imageData.width, imageData.height, radius);
    const detApprox = subtractArrays(gray, smooth);
    return {
      size,
      preview: normalizeToImage(detApprox, imageData.width, imageData.height, [1.0, 1.15, 1.3]),
      strength: Math.max(...Array.from(detApprox).map((v) => Math.abs(v))).toFixed(1),
    };
  });
}

function UploadPanel({ onUpload, sourceMeta }) {
  return (
    <div className="hero-side glass">
      <div className="upload-box">
        <input type="file" accept="image/*" onChange={onUpload} />
        <strong style={{ fontSize: 22, marginBottom: 8, fontFamily: "Space Grotesk, sans-serif" }}>{COPY.uploadTitle}</strong>
        <p style={{ lineHeight: 1.7 }}>{COPY.uploadBody}</p>
      </div>

      <div className="pill-row">
        <div className="pill">
          <strong>{"\uc785\ub825 \ud574\uc0c1\ub3c4"}</strong>
          <div>
            {sourceMeta.width} x {sourceMeta.height}
          </div>
        </div>
        <div className="pill">
          <strong>{"\uad00\ucc30 \ub300\uc0c1"}</strong>
          <div>{"\uc2a4\ucf00\uc77c \ubd88\ubcc0 \ud2b9\uc9d5\uc810"}</div>
        </div>
        <div className="pill">
          <strong>{"\uc2dc\uac01\ud654 \ud3ec\uc778\ud2b8"}</strong>
          <div>{"\ud53c\ub77c\ubbf8\ub4dc, \uadf9\uc810, \ud544\ud130"}</div>
        </div>
      </div>
    </div>
  );
}

function ScaleSpaceModule({ imageData, sourceUrl }) {
  const [sigma, setSigma] = useState(1.8);
  const [ratio, setRatio] = useState(0.1);

  const analysis = useMemo(() => {
    const gray = getGrayChannel(imageData);
    const blurred = gaussianBlurGray(gray, imageData.width, imageData.height, sigma);
    const downscaled = resizeImageData(imageData, ratio);
    return {
      blurUrl: drawImageData(floatArrayToImageData(blurred, imageData.width, imageData.height)),
      downscaledUrl: drawImageData(downscaled),
      scaleSpace: buildScaleSpace(imageData),
    };
  }, [imageData, sigma, ratio]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>{"\uc2a4\ucf00\uc77c \uacf5\uac04 \uc2dc\ubbac\ub808\uc774\ud130"}</h2>
          <p className="summary">
            {"\uc601\uc0c1\uc744 \ucd95\uc18c\ud558\uac70\ub098 sigma\ub97c \ud0a4\uc6b0\uba74 \uc138\ubd80 \uad6c\uc870\uac00 \uc5b4\ub5bb\uac8c \uc0ac\ub77c\uc9c0\ub294\uc9c0 \ud655\uc778\ud558\uace0, \uac00\uc6b0\uc2dc\uc548 \ud53c\ub77c\ubbf8\ub4dc\uac00 \uc5b4\ub5bb\uac8c \uc30d\uc774\ub294\uc9c0 \ubd10\ubcf4\uc138\uc694."}
          </p>
        </div>
        <div className="foot-note">
          {"\ud55c \uc625\ud0c0\ube0c\ub2f9 6\uc7a5\uc758 \uac00\uc6b0\uc2dc\uc548 \uc601\uc0c1"}
          <br />
          {"\ub2e4\uc74c \uc625\ud0c0\ube0c\ub294 1/2 \ud06c\uae30\uc5d0\uc11c \uc2dc\uc791"}
        </div>
      </div>

      <div className="control-card glass">
        <div className="control-grid">
          <div className="control">
            <label>{"\uac00\uc6b0\uc2dc\uc548 sigma"}</label>
            <input type="range" min="0.6" max="4.2" step="0.1" value={sigma} onChange={(e) => setSigma(Number(e.target.value))} />
            <div className="value-chip">sigma = {formatNumber(sigma, 1)}</div>
          </div>
          <div className="control">
            <label>{"\ucd95\uc18c \ube44\uc728"}</label>
            <input type="range" min="0.1" max="0.5" step="0.05" value={ratio} onChange={(e) => setRatio(Number(e.target.value))} />
            <div className="value-chip">scale = {formatNumber(ratio, 2)}</div>
          </div>
          <div className="control">
            <label>{"\uc2a4\ucf00\uc77c \uacf5\uac04"}</label>
            <div className="value-chip">2 octaves</div>
          </div>
          <div className="control">
            <label>{"\uad00\ucc30 \ub808\ubca8"}</label>
            <div className="value-chip">6 Gaussian levels</div>
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-7">
          <h3>{"\uc2a4\ucf00\uc77c \ubcc0\ud654 \ud6a8\uacfc"}</h3>
          <p>{"\uac70\ub9ac\uac00 \uba40\uc5b4\uc9c8\uc218\ub85d \ud574\uc0c1\ub3c4\uc640 \ub514\ud14c\uc77c\uc774 \uc5b4\ub5bb\uac8c \uc904\uc5b4\ub4dc\ub294\uc9c0 \uc6d0\ubcf8\uacfc \ud568\uaed8 \ube44\uad50\ud569\ub2c8\ub2e4."}</p>
          <div className="mini-grid">
            <ImageFrame title={"\uc6d0\ubcf8"} src={sourceUrl} meta={`${imageData.width} x ${imageData.height}`} />
            <ImageFrame title={"\ucd95\uc18c \uc601\uc0c1"} src={analysis.downscaledUrl} meta={`${formatNumber(ratio, 2)}x`} />
            <ImageFrame title={"sigma \ube14\ub7ec"} src={analysis.blurUrl} meta={`sigma ${formatNumber(sigma, 1)}`} />
          </div>
        </div>

        <div className="stage-card glass span-5">
          <h3>{"\uc2a4\ucf00\uc77c \ubd88\ubcc0\uc131 \ud575\uc2ec"}</h3>
          <p>{"\ud2b9\uc9d5\uc810\uc740 \ub2e8\uc77c \ud574\uc0c1\ub3c4\uc5d0\uc11c\ub9cc \ucc3e\uc9c0 \uc54a\uace0, \uc5ec\ub7ec \uc2a4\ucf00\uc77c\uc5d0\uc11c \ubc18\ubcf5 \uac80\uc0ac\ud574 \uc548\uc815\uc801\uc778 \uc9c0\uc810\uc744 \uc120\ud0dd\ud569\ub2c8\ub2e4."}</p>
          <div className="metrics-row">
            <div className="metric">
              <strong>Scale</strong>
              {"\ud06c\uae30 \ubcc0\ud654\uc5d0 \ub300\uc751"}
            </div>
            <div className="metric">
              <strong>Octave</strong>
              {"\ub2e4\uc911 \ud574\uc0c1\ub3c4 \uad6c\uc131"}
            </div>
            <div className="metric">
              <strong>Sigma</strong>
              {"\ube14\ub7ec \uc815\ub3c4 \uc870\uc808"}
            </div>
          </div>
        </div>

        <div className="stage-card glass span-12">
          <h3>{"\uac00\uc6b0\uc2dc\uc548 \ud53c\ub77c\ubbf8\ub4dc"}</h3>
          <p>{"\uac01 \uc625\ud0c0\ube0c\uc5d0\uc11c \uac00\uc6b0\uc2dc\uc548 \uc2a4\ubb34\ub529\uc744 \uc2dc\ud0a4\uace0, \ub2e4\uc74c \uc625\ud0c0\ube0c\ub85c \ub0b4\ub824\uac00\uba70 \ud2b9\uc9d5\uc810\uc774 \uc2a4\ucf00\uc77c\uc744 \ub118\uc5b4 \uc548\uc815\uc801\uc73c\ub85c \ub0a8\ub294\uc9c0 \uad00\ucc30\ud569\ub2c8\ub2e4."}</p>
          {analysis.scaleSpace.octaveImages.map((octave, octaveIndex) => (
            <div key={`oct-${octaveIndex}`} style={{ marginBottom: 18 }}>
              <div className="image-caption" style={{ marginBottom: 10 }}>
                <strong>{`\uc625\ud0c0\ube0c ${octaveIndex + 1}`}</strong>
                <span>{`${octave[0].width} x ${octave[0].height}`}</span>
              </div>
              <div className="mini-grid">
                {octave.map((level, idx) => (
                  <ImageFrame key={`g-${octaveIndex}-${idx}`} title={`G${idx + 1}`} src={level.url} meta={`sigma ${formatNumber(level.sigma, 2)}`} />
                ))}
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
          <h2>{"\ud574\ub9ac\uc2a4-\ub77c\ud50c\ub77c\uc2a4 \uc2dc\ubbac\ub808\uc774\ud130"}</h2>
          <p className="summary">
            {"\uba3c\uc800 Harris corner response\ub85c \ucf54\ub108 \ud6c4\ubcf4\ub97c \ub9cc\ub4e4\uace0, \uadf8 \ub2e4\uc74c \ub77c\ud50c\ub77c\uc2dc\uc548 \uc751\ub2f5\uc774 \uac00\uc7a5 \ud070 \uc2a4\ucf00\uc77c\uc744 \uc120\ud0dd\ud574 \uc2a4\ucf00\uc77c \ubd88\ubcc0\uc131\uc744 \uc8fc\ub294 \ud750\ub984\uc744 \ud45c\ud604\ud569\ub2c8\ub2e4."}
          </p>
        </div>
        <div className="foot-note">
          {"Harris \uc751\ub2f5\uc73c\ub85c \uc704\uce58 \ud6c4\ubcf4 \uac80\ucd9c"}
          <br />
          {"Laplacian \ucd5c\ub313\uac12\uc73c\ub85c \uc2a4\ucf00\uc77c \uc120\ud0dd"}
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-5">
          <h3>{"\ucd5c\uc885 \ud2b9\uc9d5\uc810"}</h3>
          <p>{"\ucf54\ub108 \uc751\ub2f5\uc774 \uac15\ud558\uace0 \ub77c\ud50c\ub77c\uc2dc\uc548 \ud06c\uae30\uac00 \uc2a4\ucf00\uc77c \uc0c1\uc5d0\uc11c \ucd5c\ub313\uac12\uc778 \ud3ec\uc778\ud2b8\ub9cc \ub0a8\uaca8 \ud45c\uc2dc\ud569\ub2c8\ub2e4."}</p>
          <div className="mini-grid">
            <ImageFrame title={"\uc6d0\ubcf8"} src={sourceUrl} meta="input" />
            <ImageFrame title={"Harris-Laplace"} src={analysis.overlay} meta={`${analysis.points.length} keypoints`} />
          </div>
        </div>

        <div className="stage-card glass span-7">
          <h3>{"\uc2a4\ucf00\uc77c\ubcc4 Harris \uc751\ub2f5"}</h3>
          <p>{"\uc544\ub798 \ud328\ub110\uc740 sigma\uac00 \ub2e4\ub978 \ucf54\ub108 \uc751\ub2f5 \ub9f5\uc785\ub2c8\ub2e4. \uac19\uc740 \uc704\uce58\ub77c\ub3c4 \uc2a4\ucf00\uc77c\uc5d0 \ub530\ub77c \uc751\ub2f5 \ud06c\uae30\uac00 \ub2ec\ub77c\uc9d1\ub2c8\ub2e4."}</p>
          <div className="mini-grid">
            {analysis.harrisLayers.map((layer, index) => (
              <ImageFrame key={`harris-${index}`} title={`sigma ${formatNumber(layer.sigma, 2)}`} src={layer.preview} meta={`layer ${index + 1}`} />
            ))}
          </div>
        </div>

        <div className="stage-card glass span-12">
          <h3>{"\ud574\ub9ac\uc2a4-\ub77c\ud50c\ub77c\uc2a4 \ud574\uc11d"}</h3>
          <div className="step-strip">
            <div className="step">1. {"\ud574\ub9ac\uc2a4 \uc751\ub2f5\uc73c\ub85c \ucf54\ub108 \ud6c4\ubcf4 \ucc3e\uae30"}</div>
            <div className="step">2. {"\uac01 \ud6c4\ubcf4\uc5d0\uc11c \ub2e4\uc911 \uc2a4\ucf00\uc77c \ub77c\ud50c\ub77c\uc2dc\uc548 \ube44\uad50"}</div>
            <div className="step">3. {"\uc751\ub2f5\uc774 \uac00\uc7a5 \ud070 \uc2a4\ucf00\uc77c\uc744 \uc120\ud0dd\ud574 \ubd88\ubcc0\uc131 \ud655\ubcf4"}</div>
            <div className="step">4. {"\uc6d0\uc73c\ub85c \ud45c\uc2dc\ud558\uc5ec \ud2b9\uc9d5\uc810\uc758 \uc120\ud0dd \uc2a4\ucf00\uc77c \ud45c\ud604"}</div>
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
    const gray = getGrayChannel(imageData);
    const oriented = computeOrientationMap(gray, imageData.width, imageData.height, keypoints.slice(0, 70));
    const orientationOverlay = drawOrientationOverlay(imageData, oriented);
    return {
      scaleSpace,
      dogs,
      keypoints,
      dogOverlay: drawKeypointsOverlay(imageData, keypoints, 1),
      orientationOverlay,
      oriented,
    };
  }, [imageData]);

  return (
    <div className="module-shell">
      <div className="module-header glass">
        <div>
          <h2>{"SIFT \uc2dc\ubbac\ub808\uc774\ud130"}</h2>
          <p className="summary">
            {"\uac00\uc6b0\uc2dc\uc548 \ud53c\ub77c\ubbf8\ub4dc\ub97c \ub9cc\ub4e4\uace0 DoG \uadf9\uc810\uc744 \ucc3e\uc740 \ub2e4\uc74c, \uac01 \ud2b9\uc9d5\uc810\uc758 \uc8fc\uc694 \ubc29\ud5a5\uc744 \uacc4\uc0b0\ud574 \ud68c\uc804\uc5d0\ub3c4 \ubc84\ud2f8 \uc218 \uc788\ub3c4\ub85d \ud558\ub294 \uacfc\uc815\uc744 \ub2e8\uc21c\ud654\ud574 \ubcf4\uc5ec\uc90d\ub2c8\ub2e4."}
          </p>
        </div>
        <div className="foot-note">
          {"DoG \uadf9\uc810 \uac80\ucd9c"}
          <br />
          {"\uc8fc\uc694 \ubc29\ud5a5 \ud560\ub2f9"}
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-5">
          <h3>{"DoG \uae30\ubc18 \ud2b9\uc9d5\uc810"}</h3>
          <p>{"\uc778\uc811\ud55c \uac00\uc6b0\uc2dc\uc548 \uc601\uc0c1\uc744 \ube7c\uc11c \ub9cc\ub4e0 DoG \uadf9\uc810\uc744 \uc6d0\ubcf8\uc5d0 \ud45c\uc2dc\ud569\ub2c8\ub2e4."}</p>
          <div className="mini-grid">
            <ImageFrame title={"\uc6d0\ubcf8"} src={sourceUrl} meta="input" />
            <ImageFrame title={"DoG \ud2b9\uc9d5\uc810"} src={analysis.dogOverlay} meta={`${analysis.keypoints.length} points`} />
          </div>
        </div>

        <div className="stage-card glass span-7">
          <h3>{"\uc8fc\uc694 \ubc29\ud5a5 \ubd80\uc5ec"}</h3>
          <p>{"\ud2b9\uc9d5\uc810 \uc8fc\ubcc0 \uadf8\ub77c\ub514\uc5b8\ud2b8 \ubc29\ud5a5\uc744 \uacc4\uc0b0\ud574 \ud0a4\ud3ec\uc778\ud2b8\uc5d0 \ubc29\ud5a5\uc744 \ubd80\uc5ec\ud569\ub2c8\ub2e4."}</p>
          <ImageFrame title={"\ubc29\ud5a5 \uc624\ubc84\ub808\uc774"} src={analysis.orientationOverlay} meta={`${analysis.oriented.length} oriented points`} />
        </div>

        <div className="stage-card glass span-12">
          <h3>{"DoG \ucc28\uc601\uc0c1 \ubc30\uc5f4"}</h3>
          <p>{"\uadf9\uc810\uc740 3\uac1c \uc5f0\uc18d \uc2a4\ucf00\uc77c\uc744 \uac00\ub85c\uc9c8\ub7ec \ube44\uad50\ud558\uba70 \uc120\ud0dd\ub429\ub2c8\ub2e4."}</p>
          <div className="mini-grid">
            {analysis.dogs.map((dog, index) => (
              <ImageFrame key={`dog-sift-${index}`} title={`DoG ${index + 1}`} src={dog.url} meta={`slice ${index + 1}`} />
            ))}
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
          <h2>{"SURF \uc2dc\ubbac\ub808\uc774\ud130"}</h2>
          <p className="summary">
            {"SURF\ub294 \uc774\ubbf8\uc9c0\ub97c \uacc4\uc18d \uc904\uc774\ub294 \ub300\uc2e0 \ud544\ud130 \ub9c8\uc2a4\ud06c \ud06c\uae30\ub97c \ud0a4\uc6cc \ub354 \ud070 \uad6c\uc870\ub97c \ubd05\ub2c8\ub2e4. \uc544\ub798\uc5d0\uc11c \ud544\ud130 \ud06c\uae30\ub97c \ubc14\uafc0 \ub54c \uc751\ub2f5\uc774 \uc5b4\ub5bb\uac8c \ub2ec\ub77c\uc9c0\ub294\uc9c0 \ud655\uc778\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4."}
          </p>
        </div>
        <div className="foot-note">
          {"\uc774\ubbf8\uc9c0 \ucd95\uc18c \ub300\uc2e0 \ud544\ud130 \ud655\uc7a5"}
          <br />
          {"\ube60\ub978 Hessian \uae30\ubc18 \uadfc\uc0ac"}
        </div>
      </div>

      <div className="panel-grid">
        <div className="stage-card glass span-4">
          <h3>{"\uc6d0\ubcf8 \uc601\uc0c1"}</h3>
          <ImageFrame title={"\uc785\ub825"} src={sourceUrl} meta={`${imageData.width} x ${imageData.height}`} />
        </div>

        <div className="stage-card glass span-8">
          <h3>{"\ud544\ud130 \ud06c\uae30 \ubcc0\ud654"}</h3>
          <p>{"9x9, 15x15, 21x21, 27x27 \ud544\ud130\ub85c \uadfc\uc0ac \uc751\ub2f5\uc744 \ube44\uad50\ud558\uc5ec \uc2a4\ucf00\uc77c \ud0d0\uc0c9 \ubc29\uc2dd\uc758 \ucc28\uc774\ub97c \ubcf4\uc5ec\uc90d\ub2c8\ub2e4."}</p>
          <div className="mini-grid">
            {responses.map((item) => (
              <ImageFrame key={`surf-${item.size}`} title={`${item.size} x ${item.size}`} src={item.preview} meta={`strength ${item.strength}`} />
            ))}
          </div>
        </div>

        <div className="stage-card glass span-12">
          <h3>{"SURF \ud574\uc11d"}</h3>
          <div className="step-strip">
            <div className="step">1. {"\uc774\ubbf8\uc9c0 \ud53c\ub77c\ubbf8\ub4dc \ub300\uc2e0 \ud544\ud130 \ud06c\uae30\ub97c \ud0a4\uc6c0"}</div>
            <div className="step">2. {"\ubc15\uc2a4 \ud544\ud130\ub85c Hessian determinant\ub97c \ube60\ub974\uac8c \uadfc\uc0ac"}</div>
            <div className="step">3. {"\ud070 \uad6c\uc870\uc5d0\uc11c\ub3c4 \ud2b9\uc9d5\uc810\uc744 \ud6a8\uc728\uc801\uc73c\ub85c \uac80\ucd9c"}</div>
            <div className="step">4. {"\uc2e4\uc2dc\uac04 \uc2dc\uc2a4\ud15c\uc5d0\uc11c \uc0c1\ub300\uc801\uc73c\ub85c \uc720\ub9ac"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("scale");
  const [imageData, setImageData] = useState(() => generateDemoImageData());
  const [sourceUrl, setSourceUrl] = useState(() => drawImageData(generateDemoImageData()));

  useEffect(() => {
    const initial = generateDemoImageData();
    setImageData(initial);
    setSourceUrl(drawImageData(initial));
  }, []);

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
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  const sourceMeta = { width: imageData.width, height: imageData.height };

  return (
    <div className="app-shell">
      <section className="hero">
        <div className="hero-main glass">
          <div className="eyebrow">Scale Invariant Feature Lab</div>
          <h1>{COPY.title}</h1>
          <p className="hero-copy">{COPY.subtitle}</p>
          <div className="hero-grid">
            <div className="hero-stat">
              <strong>Scale</strong>
              {"\uc2a4\ucf00\uc77c \ubcc0\ud654\uc5d0\uc11c\ub3c4 \ub0a8\ub294 \ud2b9\uc9d5\uc810 \uad00\ucc30"}
            </div>
            <div className="hero-stat">
              <strong>Keypoint</strong>
              {"\uc704\uce58\uc640 \ud06c\uae30\uac00 \uc548\uc815\uc801\uc778 \ud3ec\uc778\ud2b8 \uc120\ud0dd"}
            </div>
            <div className="hero-stat">
              <strong>Compare</strong>
              {"Harris-Laplace, SIFT, SURF \ucc28\uc774 \ube44\uad50"}
            </div>
          </div>
        </div>

        <UploadPanel onUpload={handleUpload} sourceMeta={sourceMeta} />
      </section>

      <section className="workspace">
        <aside className="sidebar glass">
          <h3 style={{ margin: 0 }}>{COPY.moduleLabel}</h3>
          <div className="tab-row">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.title}
                <span>{tab.subtitle}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-note">{COPY.sideNote}</div>
        </aside>

        <main className="content">
          {activeTab === "scale" && <ScaleSpaceModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeTab === "harris" && <HarrisLaplaceModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeTab === "sift" && <SiftModule imageData={imageData} sourceUrl={sourceUrl} />}
          {activeTab === "surf" && <SurfModule imageData={imageData} sourceUrl={sourceUrl} />}
        </main>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
