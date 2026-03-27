// Dimensionality reduction, clustering, and similarity utilities for vector visualization

export function centerData(vectors: number[][]): { centered: number[][]; mean: number[] } {
  if (vectors.length === 0) return { centered: [], mean: [] };
  const dim = vectors[0].length;
  const mean = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) mean[i] += v[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= vectors.length;
  const centered = vectors.map((v) => v.map((val, i) => val - mean[i]));
  return { centered, mean };
}

function covarianceMatrix(centered: number[][]): number[][] {
  const dim = centered[0].length;
  const n = centered.length;
  const cov: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (const v of centered) {
    for (let i = 0; i < dim; i++) {
      for (let j = i; j < dim; j++) {
        cov[i][j] += v[i] * v[j];
      }
    }
  }
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      cov[i][j] /= n - 1 || 1;
      cov[j][i] = cov[i][j];
    }
  }
  return cov;
}

function matVecMul(mat: number[][], vec: number[]): number[] {
  return mat.map((row) => row.reduce((sum, val, i) => sum + val * vec[i], 0));
}

function vecNorm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1e-10;
}

function normalize(v: number[]): number[] {
  const n = vecNorm(v);
  return v.map((x) => x / n);
}

// Power iteration to find top eigenvector
function powerIteration(mat: number[][], iterations = 100): number[] {
  const dim = mat.length;
  let vec = Array.from({ length: dim }, () => Math.random() - 0.5);
  vec = normalize(vec);
  for (let i = 0; i < iterations; i++) {
    vec = normalize(matVecMul(mat, vec));
  }
  return vec;
}

// Deflate matrix by removing component along eigenvector
function deflate(mat: number[][], eigenvec: number[]): number[][] {
  const dim = mat.length;
  const eigenvalue = eigenvec.reduce(
    (sum, _, i) => sum + eigenvec[i] * matVecMul(mat, eigenvec)[i],
    0
  );
  const result = mat.map((row) => [...row]);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      result[i][j] -= eigenvalue * eigenvec[i] * eigenvec[j];
    }
  }
  return result;
}

export function pca(vectors: number[][], numComponents = 3): number[][] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  if (dim <= numComponents) {
    // Pad to 3D
    return vectors.map((v) => {
      const padded = [...v];
      while (padded.length < numComponents) padded.push(0);
      return padded.slice(0, numComponents);
    });
  }

  const { centered } = centerData(vectors);
  let cov = covarianceMatrix(centered);
  const eigenvectors: number[][] = [];

  for (let c = 0; c < numComponents; c++) {
    const ev = powerIteration(cov);
    eigenvectors.push(ev);
    cov = deflate(cov, ev);
  }

  // Project
  return centered.map((v) =>
    eigenvectors.map((ev) => v.reduce((sum, val, i) => sum + val * ev[i], 0))
  );
}

export function randomProjection(vectors: number[][], numComponents = 3, seed = 42): number[][] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;

  // Seeded pseudo-random
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff - 0.5;
  };

  const projection: number[][] = Array.from({ length: numComponents }, () =>
    normalize(Array.from({ length: dim }, () => rand()))
  );

  return vectors.map((v) =>
    projection.map((p) => v.reduce((sum, val, i) => sum + val * p[i], 0))
  );
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-10);
}

export function findNearestNeighbors(
  vectors: number[][],
  targetIdx: number,
  k = 5
): number[] {
  const target = vectors[targetIdx];
  const similarities = vectors.map((v, i) => ({
    index: i,
    similarity: i === targetIdx ? -Infinity : cosineSimilarity(target, v),
  }));
  similarities.sort((a, b) => b.similarity - a.similarity);
  return similarities.slice(0, k).map((s) => s.index);
}

export function kMeansClustering(
  points: number[][],
  k = 5,
  maxIterations = 50
): number[] {
  if (points.length === 0) return [];
  const n = points.length;
  const dim = points[0].length;
  k = Math.min(k, n);

  // Initialize centroids with k-means++ style (simplified: evenly spaced)
  const centroids: number[][] = [];
  const step = Math.max(1, Math.floor(n / k));
  for (let i = 0; i < k; i++) {
    centroids.push([...points[Math.min(i * step, n - 1)]]);
  }

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign
    const newAssignments = points.map((p) => {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < k; c++) {
        let dist = 0;
        for (let d = 0; d < dim; d++) {
          const diff = p[d] - centroids[c][d];
          dist += diff * diff;
        }
        if (dist < minDist) {
          minDist = dist;
          best = c;
        }
      }
      return best;
    });

    // Check convergence
    if (newAssignments.every((a, i) => a === assignments[i])) break;
    assignments = newAssignments;

    // Update centroids
    const counts = new Array(k).fill(0);
    for (let c = 0; c < k; c++) {
      for (let d = 0; d < dim; d++) centroids[c][d] = 0;
    }
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let d = 0; d < dim; d++) {
        centroids[c][d] += points[i][d];
      }
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) centroids[c][d] /= counts[c];
      }
    }
  }

  return assignments;
}
