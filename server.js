/// <reference types="@citizenfx/server" />
/// <reference types="image-js" />

const imagejs = require('image-js');
const fs = require('fs');

const resName = GetCurrentResourceName();
const mainSavePath = `resources/${resName}/images`;
const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), "config.json"));

function rgbToYCbCr(r, g, b) {
	const y  = 0.299 * r + 0.587 * g + 0.114 * b;
	const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
	const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
	return [y, cb, cr];
}

try {
	if (!fs.existsSync(mainSavePath)) {
		fs.mkdirSync(mainSavePath);
	}

	onNet('getExistingScreenshots', (type) => {
		const playerSrc = source;
		const savePath = `${mainSavePath}/${type}`;
		let files = [];
		if (!config.overwriteExistingImages && fs.existsSync(savePath)) {
			files = fs.readdirSync(savePath)
				.filter(f => f.endsWith('.png'))
				.map(f => f.replace('.png', ''));
		}

		if (type === 'clothing') {
			try {
				const manifestRaw = LoadResourceFile('appearance', 'clothing_images.json');
				if (manifestRaw && manifestRaw.trim().length > 2) {
					const manifest = JSON.parse(manifestRaw);
					for (const gender of Object.keys(manifest)) {
						for (const itemType of Object.keys(manifest[gender])) {
							for (const componentId of Object.keys(manifest[gender][itemType])) {
								for (const drawable of Object.keys(manifest[gender][itemType][componentId])) {
									const prefix = itemType === 'props' ? `${gender}_prop_` : `${gender}_`;
									files.push(`${prefix}${componentId}_${drawable}`);
								}
							}
						}
					}
				}
			} catch (e) {}
		}

		emitNet('getExistingScreenshots:result', playerSrc, type, files);
	});

	onNet('takeScreenshot', async (filename, type) => {
		const playerSrc = source;

		const savePath = `${mainSavePath}/${type}`;
		if (!fs.existsSync(savePath)) {
			fs.mkdirSync(savePath, { recursive: true });
		}

		const fullFilePath = savePath + "/" + filename + ".png";

		if (!config.overwriteExistingImages && fs.existsSync(fullFilePath)) {
			if (config.debug) console.log(`DEBUG: Skipping existing file: ${filename}.png`);
			return;
		}

		exports['screenshot-basic'].requestClientScreenshot(
			playerSrc,
			{
				fileName: fullFilePath,
				encoding: 'png',
				quality: 1.0,
			},
			async (err, fileName) => {
				try {
					if (err) {
						console.error(`[greenscreener] Screenshot error for ${filename}: ${err}`);
						return;
					}
					if (!fileName || !fs.existsSync(fileName)) {
						console.error(`[greenscreener] Screenshot file missing: ${filename}`);
						return;
					}

					const fileBuffer = fs.readFileSync(fileName);
					const image = await imagejs.Image.load(fileBuffer);
					const w = image.width;
					const h = image.height;

					const samplePoints = [
						[5, 5], [20, 5], [5, 20],
						[w - 6, 5], [w - 21, 5], [w - 6, 20],
						[w - 6, h - 6], [w - 21, h - 6],
						[Math.floor(w / 2), 5],
						[Math.floor(w / 2), h - 6],
					];

					let bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;
					for (const [sx, sy] of samplePoints) {
						if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
							const p = image.getPixelXY(sx, sy);
							bgR += p[0]; bgG += p[1]; bgB += p[2];
							sampleCount++;
						}
					}
					bgR = Math.round(bgR / sampleCount);
					bgG = Math.round(bgG / sampleCount);
					bgB = Math.round(bgB / sampleCount);

					const [, cbKey, crKey] = rgbToYCbCr(bgR, bgG, bgB);

					const cbcrDistMap = new Float32Array(w * h);
					for (let y = 0; y < h; y++) {
						for (let x = 0; x < w; x++) {
							const p = image.getPixelXY(x, y);
							const [_, cb, cr] = rgbToYCbCr(p[0], p[1], p[2]);
							const dcb = cb - cbKey;
							const dcr = cr - crKey;
							cbcrDistMap[y * w + x] = Math.sqrt(dcb * dcb + dcr * dcr);
						}
					}

					const floodTol = 14;
					const closeMap = new Uint8Array(w * h);
					for (let i = 0; i < w * h; i++) {
						if (cbcrDistMap[i] < floodTol) closeMap[i] = 1;
					}

					const bgMask = new Uint8Array(w * h);
					const queue = [];

					for (let x = 0; x < w; x++) {
						if (closeMap[x]) { bgMask[x] = 1; queue.push(x); }
						const bi = (h - 1) * w + x;
						if (closeMap[bi]) { bgMask[bi] = 1; queue.push(bi); }
					}
					for (let y = 1; y < h - 1; y++) {
						const li = y * w;
						if (closeMap[li]) { bgMask[li] = 1; queue.push(li); }
						const ri = y * w + w - 1;
						if (closeMap[ri]) { bgMask[ri] = 1; queue.push(ri); }
					}

					let qi = 0;
					while (qi < queue.length) {
						const idx = queue[qi++];
						const x = idx % w;
						const y = (idx - x) / w;
						if (x > 0)     { const ni = idx - 1; if (closeMap[ni] && !bgMask[ni]) { bgMask[ni] = 1; queue.push(ni); } }
						if (x < w - 1) { const ni = idx + 1; if (closeMap[ni] && !bgMask[ni]) { bgMask[ni] = 1; queue.push(ni); } }
						if (y > 0)     { const ni = idx - w; if (closeMap[ni] && !bgMask[ni]) { bgMask[ni] = 1; queue.push(ni); } }
						if (y < h - 1) { const ni = idx + w; if (closeMap[ni] && !bgMask[ni]) { bgMask[ni] = 1; queue.push(ni); } }
					}

					const pureBgTol = 8;
					for (let i = 0; i < w * h; i++) {
						if (!bgMask[i] && cbcrDistMap[i] < pureBgTol) {
							bgMask[i] = 1;
						}
					}

					const tola = 8;
					const tolb = 20;
					const newImage = new imagejs.Image(w, h, { kind: 'RGBA' });
					let minX = w, maxX = -1, minY = h, maxY = -1;

					for (let y = 0; y < h; y++) {
						for (let x = 0; x < w; x++) {
							const idx = y * w + x;

							if (bgMask[idx]) {
								newImage.setPixelXY(x, y, [0, 0, 0, 0]);
							} else {
								const p = image.getPixelXY(x, y);
								let alpha = 255;

								const adjBg = (x > 0 && bgMask[idx - 1]) ||
								              (x < w - 1 && bgMask[idx + 1]) ||
								              (y > 0 && bgMask[idx - w]) ||
								              (y < h - 1 && bgMask[idx + w]);

								if (adjBg) {
									const dist = cbcrDistMap[idx];
									if (dist < tola) {
										alpha = 0;
									} else if (dist < tolb) {
										alpha = Math.round(255 * (dist - tola) / (tolb - tola));
									}
								}

								newImage.setPixelXY(x, y, [p[0], p[1], p[2], alpha]);
								if (alpha > 0) {
									minX = Math.min(minX, x);
									maxX = Math.max(maxX, x);
									minY = Math.min(minY, y);
									maxY = Math.max(maxY, y);
								}
							}
						}
					}

					const minCluster = config.minClusterSize || 50;
					const visited = new Uint8Array(w * h);

					for (let startY = 0; startY < h; startY++) {
						for (let startX = 0; startX < w; startX++) {
							const startIdx = startY * w + startX;
							if (visited[startIdx] || bgMask[startIdx]) continue;

							const startPixel = newImage.getPixelXY(startX, startY);
							if (startPixel[3] === 0) { visited[startIdx] = 1; continue; }

							const cluster = [startIdx];
							const cQueue = [startIdx];
							visited[startIdx] = 1;
							let ci = 0;

							while (ci < cQueue.length) {
								const cIdx = cQueue[ci++];
								const cx = cIdx % w;
								const cy = (cIdx - cx) / w;
								const neighbors = [];
								if (cx > 0) neighbors.push(cIdx - 1);
								if (cx < w - 1) neighbors.push(cIdx + 1);
								if (cy > 0) neighbors.push(cIdx - w);
								if (cy < h - 1) neighbors.push(cIdx + w);
								for (const ni of neighbors) {
									if (visited[ni]) continue;
									visited[ni] = 1;
									if (bgMask[ni]) continue;
									const nx = ni % w;
									const ny = (ni - nx) / w;
									const np = newImage.getPixelXY(nx, ny);
									if (np[3] > 0) {
										cluster.push(ni);
										cQueue.push(ni);
									}
								}
							}

							if (cluster.length < minCluster) {
								for (const cIdx of cluster) {
									const cx = cIdx % w;
									const cy = (cIdx - cx) / w;
									newImage.setPixelXY(cx, cy, [0, 0, 0, 0]);
								}
							}
						}
					}

					minX = w; maxX = -1; minY = h; maxY = -1;
					for (let y = 0; y < h; y++) {
						for (let x = 0; x < w; x++) {
							const px = newImage.getPixelXY(x, y);
							if (px[3] > 0) {
								minX = Math.min(minX, x);
								maxX = Math.max(maxX, x);
								minY = Math.min(minY, y);
								maxY = Math.max(maxY, y);
							}
						}
					}

					const outputSize = config.outputImageSize || 0;
					let finalImage = newImage;

					if (maxX >= minX && maxY >= minY) {
						const pad = 10;
						const cropX = Math.max(0, minX - pad);
						const cropY = Math.max(0, minY - pad);
						const cropW = Math.min(w - cropX, (maxX - minX + 1) + pad * 2);
						const cropH = Math.min(h - cropY, (maxY - minY + 1) + pad * 2);

						const cropped = newImage.crop({
							x: cropX,
							y: cropY,
							width: cropW,
							height: cropH
						});

						if (outputSize > 0) {
							const scale = Math.min(outputSize / cropped.width, outputSize / cropped.height);
							const scaledW = Math.round(cropped.width * scale);
							const scaledH = Math.round(cropped.height * scale);
							const resized = cropped.resize({ width: scaledW, height: scaledH });

							const canvas = new imagejs.Image(outputSize, outputSize, { kind: 'RGBA' });
							for (let fy = 0; fy < outputSize; fy++) {
								for (let fx = 0; fx < outputSize; fx++) {
									canvas.setPixelXY(fx, fy, [0, 0, 0, 0]);
								}
							}

							const offsetX = Math.floor((outputSize - scaledW) / 2);
							const offsetY = Math.floor((outputSize - scaledH) / 2);

							for (let py = 0; py < scaledH; py++) {
								for (let px = 0; px < scaledW; px++) {
									const pixel = resized.getPixelXY(px, py);
									canvas.setPixelXY(offsetX + px, offsetY + py, pixel);
								}
							}
							finalImage = canvas;
						} else {
							finalImage = cropped;
						}
					}

					await finalImage.save(fileName, { format: 'png' });
					console.log(`[greenscreener] Saved: ${filename}.png (${finalImage.width}x${finalImage.height})`);
				} catch (err) {
					console.error(`[greenscreener] Error processing ${filename}: ${err.message}`);
				}
			}
		);
	});
} catch (error) {
	console.error(error.message);
}
