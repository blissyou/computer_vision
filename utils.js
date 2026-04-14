window.CVUtils = (() => {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value, digits = 2) {
    return Number(value).toFixed(digits);
  }

  function sampleEvery(list, maxItems) {
    if (list.length <= maxItems) return list;
    const step = list.length / maxItems;
    const sampled = [];
    for (let i = 0; i < maxItems; i += 1) {
      sampled.push(list[Math.floor(i * step)]);
    }
    return sampled;
  }

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function imageDataToDataUrl(imageData) {
    const canvas = createCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }

  function floatArrayToImageData(values, width, height, options = {}) {
    const { grayscale = true, normalize = true, tint = null } = options;
    const imageData = new ImageData(width, height);
    let min = Infinity;
    let max = -Infinity;
    if (normalize) {
      for (let i = 0; i < values.length; i += 1) {
        const v = values[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (Math.abs(max - min) < 1e-5) {
        max = min + 1;
      }
    }
    for (let i = 0; i < values.length; i += 1) {
      const raw = normalize ? ((values[i] - min) / (max - min)) * 255 : clamp(values[i], 0, 255);
      const idx = i * 4;
      if (grayscale) {
        imageData.data[idx] = raw;
        imageData.data[idx + 1] = raw;
        imageData.data[idx + 2] = raw;
      } else {
        const [rScale, gScale, bScale] = tint || [1, 1, 1];
        imageData.data[idx] = clamp(raw * rScale, 0, 255);
        imageData.data[idx + 1] = clamp(raw * gScale, 0, 255);
        imageData.data[idx + 2] = clamp(raw * bScale, 0, 255);
      }
      imageData.data[idx + 3] = 255;
    }
    return imageData;
  }

  function getGrayChannel(imageData) {
    const gray = new Float32Array(imageData.width * imageData.height);
    for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return gray;
  }

  function getRgbPixels(imageData) {
    const pixels = [];
    for (let i = 0; i < imageData.data.length; i += 4) {
      pixels.push([imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]]);
    }
    return pixels;
  }

  function resizeImageData(imageData, scale) {
    const width = Math.max(1, Math.round(imageData.width * scale));
    const height = Math.max(1, Math.round(imageData.height * scale));
    const src = createCanvas(imageData.width, imageData.height);
    src.getContext("2d").putImageData(imageData, 0, 0);
    const dst = createCanvas(width, height);
    const ctx = dst.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }

  function generateDemoImageData(width = 320, height = 240) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#101f48");
    gradient.addColorStop(0.45, "#1c6ea4");
    gradient.addColorStop(1, "#f29f5c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 18; i += 1) {
      ctx.beginPath();
      ctx.arc(30 + ((i * 41) % width), 30 + ((i * 53) % height), 8 + (i % 5) * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    for (let x = 18; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(width - x * 0.35, height);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(36, 42, 88, 58);
    ctx.fillStyle = "#0b1b38";
    ctx.fillRect(56, 60, 48, 24);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(202, 76, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#66d9c3";
    ctx.beginPath();
    ctx.moveTo(210, 132);
    ctx.lineTo(302, 180);
    ctx.lineTo(154, 200);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ef476f";
    ctx.fillRect(212, 142, 50, 50);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 26px Space Grotesk";
    ctx.fillText("CV", 222, 176);
    return ctx.getImageData(0, 0, width, height);
  }

  function gaussianKernel1D(sigma) {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const kernel = [];
    let sum = 0;
    for (let i = -radius; i <= radius; i += 1) {
      const value = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel.push(value);
      sum += value;
    }
    return kernel.map((value) => value / sum);
  }

  function convolve1D(data, width, height, kernel, horizontal) {
    const radius = Math.floor(kernel.length / 2);
    const out = new Float32Array(data.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let acc = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const nx = horizontal ? clamp(x + k, 0, width - 1) : x;
          const ny = horizontal ? y : clamp(y + k, 0, height - 1);
          acc += data[ny * width + nx] * kernel[k + radius];
        }
        out[y * width + x] = acc;
      }
    }
    return out;
  }

  function gaussianBlurGray(gray, width, height, sigma) {
    const kernel = gaussianKernel1D(sigma);
    const temp = convolve1D(gray, width, height, kernel, true);
    return convolve1D(temp, width, height, kernel, false);
  }

  function boxBlurGray(gray, width, height, radius) {
    const out = new Float32Array(gray.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = clamp(x + dx, 0, width - 1);
            const ny = clamp(y + dy, 0, height - 1);
            sum += gray[ny * width + nx];
            count += 1;
          }
        }
        out[y * width + x] = sum / count;
      }
    }
    return out;
  }

  function subtractArrays(a, b) {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 1) {
      out[i] = a[i] - b[i];
    }
    return out;
  }

  function buildScaleSpace(imageData) {
    const octaveImages = [];
    const dogImages = [];
    const baseLevels = [1.0, 1.35, 1.75, 2.15, 2.7, 3.3];
    let currentImage = imageData;

    for (let octave = 0; octave < 2; octave += 1) {
      const gray = getGrayChannel(currentImage);
      const gaussianLevels = baseLevels.map((sigma) => {
        const blurred = gaussianBlurGray(gray, currentImage.width, currentImage.height, sigma);
        return {
          sigma,
          width: currentImage.width,
          height: currentImage.height,
          data: blurred,
          url: imageDataToDataUrl(floatArrayToImageData(blurred, currentImage.width, currentImage.height)),
        };
      });
      octaveImages.push(gaussianLevels);

      const dogs = [];
      for (let i = 0; i < gaussianLevels.length - 1; i += 1) {
        const diff = subtractArrays(gaussianLevels[i + 1].data, gaussianLevels[i].data);
        dogs.push({
          width: currentImage.width,
          height: currentImage.height,
          index: i,
          data: diff,
          url: imageDataToDataUrl(
            floatArrayToImageData(diff, currentImage.width, currentImage.height, {
              grayscale: false,
              tint: [1.15, 0.85, 1.3],
            })
          ),
        });
      }
      dogImages.push(dogs);
      currentImage = resizeImageData(currentImage, 0.5);
    }

    return { octaveImages, dogImages };
  }

  function findKeypointsFromDogs(dogStack, width, height, threshold = 13) {
    if (dogStack.length < 5) return [];
    const keypoints = [];
    const candidates = [1, 2, 3];

    for (const level of candidates) {
      const current = dogStack[level].data;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const idx = y * width + x;
          const value = current[idx];
          if (Math.abs(value) < threshold) continue;
          let isMax = true;
          let isMin = true;
          for (let dz = -1; dz <= 1; dz += 1) {
            const layer = dogStack[level + dz].data;
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                const neighbor = layer[(y + dy) * width + (x + dx)];
                if (value <= neighbor) isMax = false;
                if (value >= neighbor) isMin = false;
                if (!isMax && !isMin) break;
              }
              if (!isMax && !isMin) break;
            }
            if (!isMax && !isMin) break;
          }
          if (isMax || isMin) {
            keypoints.push({ x, y, value, level });
          }
        }
      }
    }

    return sampleEvery(
      keypoints.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
      180
    );
  }

  function drawKeypointsOverlay(imageData, keypoints, scaleFactor = 1) {
    const canvas = createCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);
    ctx.lineWidth = 1.4;

    keypoints.forEach((point) => {
      const hue = point.value > 0 ? "#66d9c3" : "#ff8ba7";
      ctx.strokeStyle = hue;
      ctx.beginPath();
      ctx.arc(point.x / scaleFactor, point.y / scaleFactor, 3 + point.level * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x / scaleFactor - 2, point.y / scaleFactor);
      ctx.lineTo(point.x / scaleFactor + 2, point.y / scaleFactor);
      ctx.moveTo(point.x / scaleFactor, point.y / scaleFactor - 2);
      ctx.lineTo(point.x / scaleFactor, point.y / scaleFactor + 2);
      ctx.stroke();
    });

    return canvas.toDataURL();
  }

  function buildHistogram(gray) {
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i += 1) {
      histogram[Math.round(gray[i])] += 1;
    }
    return histogram;
  }

  function computeMultiOtsu(histogram, total) {
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
        if (score > best.score) {
          best = { t1, t2, score };
        }
      }
    }
    return best;
  }

  function applyTriThreshold(gray, width, height, t1, t2) {
    const imageData = new ImageData(width, height);
    const palette = [
      [17, 30, 61],
      [102, 217, 195],
      [255, 184, 107],
    ];
    for (let i = 0; i < gray.length; i += 1) {
      const level = gray[i] < t1 ? 0 : gray[i] < t2 ? 1 : 2;
      const idx = i * 4;
      imageData.data[idx] = palette[level][0];
      imageData.data[idx + 1] = palette[level][1];
      imageData.data[idx + 2] = palette[level][2];
      imageData.data[idx + 3] = 255;
    }
    return imageData;
  }

  function runKMeans(imageData, k = 4, iterations = 7) {
    const pixels = getRgbPixels(imageData);
    const sampled = sampleEvery(pixels, 1400);
    const centroids = [];
    for (let i = 0; i < k; i += 1) {
      centroids.push(sampled[Math.floor((sampled.length - 1) * (i / Math.max(1, k - 1)))].slice());
    }

    let assignments = new Array(sampled.length).fill(0);
    for (let iter = 0; iter < iterations; iter += 1) {
      assignments = sampled.map((pixel) => {
        let bestIndex = 0;
        let bestDist = Infinity;
        centroids.forEach((centroid, idx) => {
          const dist =
            (pixel[0] - centroid[0]) ** 2 +
            (pixel[1] - centroid[1]) ** 2 +
            (pixel[2] - centroid[2]) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = idx;
          }
        });
        return bestIndex;
      });

      const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
      sampled.forEach((pixel, idx) => {
        const bucket = sums[assignments[idx]];
        bucket[0] += pixel[0];
        bucket[1] += pixel[1];
        bucket[2] += pixel[2];
        bucket[3] += 1;
      });

      centroids.forEach((centroid, idx) => {
        if (sums[idx][3] > 0) {
          centroid[0] = sums[idx][0] / sums[idx][3];
          centroid[1] = sums[idx][1] / sums[idx][3];
          centroid[2] = sums[idx][2] / sums[idx][3];
        }
      });
    }

    const fullAssignments = new Array(pixels.length).fill(0);
    for (let i = 0; i < pixels.length; i += 1) {
      let bestIndex = 0;
      let bestDist = Infinity;
      centroids.forEach((centroid, idx) => {
        const dist =
          (pixels[i][0] - centroid[0]) ** 2 +
          (pixels[i][1] - centroid[1]) ** 2 +
          (pixels[i][2] - centroid[2]) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = idx;
        }
      });
      fullAssignments[i] = bestIndex;
    }

    const segmented = new ImageData(imageData.width, imageData.height);
    for (let i = 0; i < pixels.length; i += 1) {
      const idx = i * 4;
      const clusterColor = centroids[fullAssignments[i]];
      segmented.data[idx] = clusterColor[0];
      segmented.data[idx + 1] = clusterColor[1];
      segmented.data[idx + 2] = clusterColor[2];
      segmented.data[idx + 3] = 255;
    }

    return {
      segmented,
      centroids,
      scatterPoints: sampled.map((pixel, idx) => ({
        rgb: pixel,
        cluster: assignments[idx],
      })),
    };
  }

  function regionVariance(gray, width, x, y, size) {
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let yy = y; yy < Math.min(y + size, Math.floor(gray.length / width)); yy += 1) {
      for (let xx = x; xx < Math.min(x + size, width); xx += 1) {
        const value = gray[yy * width + xx];
        sum += value;
        sumSq += value * value;
        count += 1;
      }
    }
    const mean = sum / count;
    return (sumSq / count) - mean * mean;
  }

  function splitBlocks(gray, width, height, threshold, minSize) {
    const blocks = [];
    const steps = [];

    function visit(x, y, size, depth) {
      const variance = regionVariance(gray, width, x, y, size);
      const shouldSplit = variance > threshold && size > minSize;
      steps.push({ x, y, size, depth, variance, action: shouldSplit ? "split" : "keep" });
      if (shouldSplit) {
        const half = Math.max(1, Math.floor(size / 2));
        visit(x, y, half, depth + 1);
        visit(x + half, y, half, depth + 1);
        visit(x, y + half, half, depth + 1);
        visit(x + half, y + half, half, depth + 1);
      } else {
        blocks.push({ x, y, size, variance });
      }
    }

    visit(0, 0, Math.min(width, height), 0);
    return { blocks, steps };
  }

  function mergeBlocks(gray, width, blocks, mergeThreshold) {
    const merged = [];
    const visited = new Array(blocks.length).fill(false);
    const means = blocks.map((block) => {
      let sum = 0;
      let count = 0;
      for (let y = block.y; y < Math.min(block.y + block.size, Math.floor(gray.length / width)); y += 1) {
        for (let x = block.x; x < Math.min(block.x + block.size, width); x += 1) {
          sum += gray[y * width + x];
          count += 1;
        }
      }
      return sum / Math.max(1, count);
    });

    function touches(a, b) {
      const horizontalTouch =
        a.y < b.y + b.size &&
        a.y + a.size > b.y &&
        (a.x + a.size === b.x || b.x + b.size === a.x);
      const verticalTouch =
        a.x < b.x + b.size &&
        a.x + a.size > b.x &&
        (a.y + a.size === b.y || b.y + b.size === a.y);
      return horizontalTouch || verticalTouch;
    }

    for (let i = 0; i < blocks.length; i += 1) {
      if (visited[i]) continue;
      const group = [i];
      visited[i] = true;
      for (let j = i + 1; j < blocks.length; j += 1) {
        if (!visited[j] && touches(blocks[i], blocks[j]) && Math.abs(means[i] - means[j]) < mergeThreshold) {
          visited[j] = true;
          group.push(j);
        }
      }
      merged.push(group);
    }

    return merged.map((group) => ({
      members: group.map((index) => blocks[index]),
      mean: group.reduce((acc, index) => acc + means[index], 0) / group.length,
    }));
  }

  function renderSplitMergeMap(imageData, blocks, mergedGroups) {
    const canvas = createCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    blocks.forEach((block) => {
      ctx.strokeRect(block.x, block.y, block.size, block.size);
    });

    const palette = ["#66d9c3", "#ffb86b", "#8fb8ff", "#ff8ba7", "#b5e48c", "#ffd6ff"];
    mergedGroups.forEach((group, index) => {
      ctx.fillStyle = `${palette[index % palette.length]}33`;
      group.members.forEach((block) => {
        ctx.fillRect(block.x, block.y, block.size, block.size);
      });
    });
    return canvas.toDataURL();
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let rgb = [0, 0, 0];
    if (hp >= 0 && hp < 1) rgb = [c, x, 0];
    else if (hp < 2) rgb = [x, c, 0];
    else if (hp < 3) rgb = [0, c, x];
    else if (hp < 4) rgb = [0, x, c];
    else if (hp < 5) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    const m = l - c / 2;
    const [r, g, b] = rgb.map((value) => Math.round((value + m) * 255));
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ];
  }

  function buildGraphSegmentation(imageData, k = 350) {
    const small = resizeImageData(imageData, 0.28);
    const width = small.width;
    const height = small.height;
    const data = small.data;
    const pixelCount = width * height;
    const edges = [];

    function colorDiff(i, j) {
      const idxA = i * 4;
      const idxB = j * 4;
      return Math.sqrt(
        (data[idxA] - data[idxB]) ** 2 +
          (data[idxA + 1] - data[idxB + 1]) ** 2 +
          (data[idxA + 2] - data[idxB + 2]) ** 2
      );
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const id = y * width + x;
        if (x + 1 < width) {
          edges.push({ a: id, b: id + 1, w: colorDiff(id, id + 1) });
        }
        if (y + 1 < height) {
          edges.push({ a: id, b: id + width, w: colorDiff(id, id + width) });
        }
      }
    }

    edges.sort((a, b) => a.w - b.w);

    const parent = new Array(pixelCount).fill(0).map((_, index) => index);
    const size = new Array(pixelCount).fill(1);
    const internal = new Array(pixelCount).fill(0);

    function find(x) {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }

    function unite(a, b, weight) {
      let ra = find(a);
      let rb = find(b);
      if (ra === rb) return false;
      const threshA = internal[ra] + k / size[ra];
      const threshB = internal[rb] + k / size[rb];
      if (weight > Math.min(threshA, threshB)) return false;
      if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
      parent[rb] = ra;
      size[ra] += size[rb];
      internal[ra] = Math.max(weight, internal[ra], internal[rb]);
      return true;
    }

    const mstEdges = [];
    const snapshots = [];
    const snapshotTargets = [40, 140, 340];
    edges.forEach((edge, index) => {
      if (unite(edge.a, edge.b, edge.w)) mstEdges.push(edge);
      if (snapshotTargets.includes(index)) {
        snapshots.push({
          index,
          edgeCount: mstEdges.length,
          segmentCount: new Set(parent.map((_, i) => find(i))).size,
        });
      }
    });

    const groups = {};
    for (let i = 0; i < pixelCount; i += 1) {
      const root = find(i);
      if (!groups[root]) groups[root] = [];
      groups[root].push(i);
    }

    const roots = Object.keys(groups);
    const segmented = new ImageData(width, height);
    roots.forEach((root, index) => {
      const color = hexToRgb(hslToHex((index / Math.max(1, roots.length)) * 360, 74, 64));
      groups[root].forEach((pixelId) => {
        const base = pixelId * 4;
        segmented.data[base] = color[0];
        segmented.data[base + 1] = color[1];
        segmented.data[base + 2] = color[2];
        segmented.data[base + 3] = 255;
      });
    });

    return {
      small,
      segmented,
      width,
      height,
      mstEdges,
      snapshots,
      segmentCount: roots.length,
      averageEdge: mstEdges.length
        ? mstEdges.reduce((acc, edge) => acc + edge.w, 0) / mstEdges.length
        : 0,
    };
  }

  function drawHistogram(canvas, histogram, t1, t2) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b1630";
    ctx.fillRect(0, 0, width, height);
    const max = Math.max(...histogram);
    for (let i = 0; i < histogram.length; i += 1) {
      const x = (i / 255) * width;
      const barHeight = (histogram[i] / max) * (height - 26);
      ctx.fillStyle =
        i < t1
          ? "rgba(102,217,195,0.85)"
          : i < t2
          ? "rgba(255,184,107,0.85)"
          : "rgba(143,184,255,0.85)";
      ctx.fillRect(x, height - barHeight, Math.ceil(width / 256), barHeight);
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    [t1, t2].forEach((threshold, index) => {
      ctx.beginPath();
      const x = (threshold / 255) * width;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillStyle = index === 0 ? "#66d9c3" : "#ffb86b";
      ctx.fillText(`t${index + 1}: ${threshold}`, x + 6, 18 + index * 16);
    });
  }

  function drawRgbScatter(canvas, points, centroids, rotation) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#081221";
    ctx.fillRect(0, 0, width, height);

    const angleY = rotation;
    const angleX = -0.55;
    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);
    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);

    function project(rgb) {
      const x = rgb[0] - 128;
      const y = rgb[1] - 128;
      const z = rgb[2] - 128;
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      const y1 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;
      const scale = 0.8 + (z2 + 128) / 384;
      return {
        x: width / 2 + x1 * 0.9,
        y: height / 2 - y1 * 0.9,
        scale,
      };
    }

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    [
      [[0, 0, 0], [255, 0, 0]],
      [[0, 0, 0], [0, 255, 0]],
      [[0, 0, 0], [0, 0, 255]],
    ].forEach(([start, end]) => {
      const a = project(start);
      const b = project(end);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    points.forEach((point) => {
      const projected = project(point.rgb);
      ctx.fillStyle = `rgba(${point.rgb[0]}, ${point.rgb[1]}, ${point.rgb[2]}, 0.72)`;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, 1.6 * projected.scale, 0, Math.PI * 2);
      ctx.fill();
    });

    centroids.forEach((centroid) => {
      const projected = project(centroid);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, 6 * projected.scale, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("R", width - 40, height / 2 + 8);
    ctx.fillText("G", width / 2 - 8, 26);
    ctx.fillText("B", 26, height / 2 + 8);
  }

  function drawMstPreview(canvas, graphSegmentation) {
    if (!canvas || !graphSegmentation) return;
    const { width, height, mstEdges } = graphSegmentation;
    const ctx = canvas.getContext("2d");
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#09111f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const previewEdges = sampleEvery(mstEdges, 260);
    previewEdges.forEach((edge, index) => {
      const ax = (edge.a % width) * scaleX + scaleX / 2;
      const ay = Math.floor(edge.a / width) * scaleY + scaleY / 2;
      const bx = (edge.b % width) * scaleX + scaleX / 2;
      const by = Math.floor(edge.b / width) * scaleY + scaleY / 2;
      ctx.strokeStyle = `hsla(${190 + (index % 120)}, 80%, 70%, 0.35)`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    });
  }

  return {
    clamp,
    formatNumber,
    sampleEvery,
    createCanvas,
    imageDataToDataUrl,
    floatArrayToImageData,
    getGrayChannel,
    getRgbPixels,
    resizeImageData,
    generateDemoImageData,
    gaussianBlurGray,
    boxBlurGray,
    subtractArrays,
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
    drawRgbScatter,
    drawMstPreview,
  };
})();
