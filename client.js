/// <reference types="@citizenfx/client" />

const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), 'config.json'));
const tattooData = JSON.parse(LoadResourceFile(GetCurrentResourceName(), 'tattoos.json'));

const Delay = (ms) => new Promise((res) => setTimeout(res, ms));

let cam;
let camInfo;
let ped;
let tickId;
const playerId = PlayerId();
let QBCore = null;

if (config.useQBVehicles) {
	QBCore = exports[config.coreResourceName].GetCoreObject();
}

let existingScreenshots = new Set();
let existingScreenshotsResolve = null;

onNet('getExistingScreenshots:result', (_resultType, files) => {
	existingScreenshots = new Set(files);
	console.log(`[greenscreener] Found ${files.length} existing screenshots to skip`);
	if (existingScreenshotsResolve) {
		existingScreenshotsResolve();
		existingScreenshotsResolve = null;
	}
});

function fetchExistingScreenshots(type) {
	return new Promise((resolve) => {
		existingScreenshotsResolve = resolve;
		emitNet('getExistingScreenshots', type);
		setTimeout(() => {
			if (existingScreenshotsResolve) {
				existingScreenshotsResolve();
				existingScreenshotsResolve = null;
			}
		}, 3000);
	});
}

let freezeTickId = null;
let freezeRotation = null;

function startPedFreeze(pedHandle) {
	FreezeEntityPosition(pedHandle, true);
	if (freezeTickId) clearTick(freezeTickId);
	freezeTickId = setTick(() => {
		ClearPedTasksImmediately(pedHandle);
		if (freezeRotation) {
			SetEntityRotation(pedHandle, freezeRotation.x, freezeRotation.y, freezeRotation.z, 2, false);
		}
	});
}

function stopPedFreeze() {
	if (freezeTickId) {
		clearTick(freezeTickId);
		freezeTickId = null;
	}
	freezeRotation = null;
}

async function takeScreenshotForComponent(pedType, type, component, drawable, texture, cameraSettings) {
	const filename = `${pedType}_${type == 'PROPS' ? 'prop_' : ''}${component}_${drawable}${texture ? `_${texture}`: ''}`;

	if (existingScreenshots.has(filename)) return;

	const cameraInfo = cameraSettings ? cameraSettings : config.cameraSettings[type][component];

	if (!camInfo || camInfo.zPos !== cameraInfo.zPos || camInfo.fov !== cameraInfo.fov) {
		camInfo = cameraInfo;

		setWeatherTime();
		DisplayRadar(false);
		DisplayHud(false);

		if (cam) {
			DestroyAllCams(true);
			DestroyCam(cam, true);
			cam = null;
		}

		freezeRotation = { x: config.greenScreenRotation.x, y: config.greenScreenRotation.y, z: config.greenScreenRotation.z };
		SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
		SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);

		await Delay(50);

		const [playerX, playerY, playerZ] = GetEntityCoords(ped);
		const [fwdX, fwdY, fwdZ] = GetEntityForwardVector(ped);

		const fwdPos = {
			x: playerX + fwdX * 1.2,
			y: playerY + fwdY * 1.2,
			z: playerZ + fwdZ + camInfo.zPos,
		};

		cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', fwdPos.x, fwdPos.y, fwdPos.z, 0, 0, 0, camInfo.fov, true, 0);

		PointCamAtCoord(cam, playerX, playerY, playerZ + camInfo.zPos);
		SetCamActive(cam, true);
		RenderScriptCams(true, false, 0, true, false, 0);

		await Delay(200);
	}

	freezeRotation = { x: camInfo.rotation.x, y: camInfo.rotation.y, z: camInfo.rotation.z };
	SetEntityRotation(ped, camInfo.rotation.x, camInfo.rotation.y, camInfo.rotation.z, 2, false);

	await Delay(100);

	emitNet('takeScreenshot', filename, 'clothing');
	await Delay(500);
}

function safeSetComponent(pedHandle, componentId, drawable) {
	const max = GetNumberOfPedDrawableVariations(pedHandle, componentId);
	SetPedComponentVariation(pedHandle, componentId, Math.min(drawable, max - 1), 0, 0);
}

function stripPedForTattoos(pedHandle) {
	const clothing = config.tattooPedClothing || {};
	safeSetComponent(pedHandle, 3, 15);
	safeSetComponent(pedHandle, 4, clothing.pants !== undefined ? clothing.pants : 21);
	safeSetComponent(pedHandle, 6, 34);
	safeSetComponent(pedHandle, 8, 15);
	safeSetComponent(pedHandle, 11, 15);
	for (const prop of Object.keys(config.cameraSettings.PROPS)) {
		ClearPedProp(pedHandle, parseInt(prop));
	}
}

async function setupTattooCamera(cameraInfo) {
	if (!camInfo || camInfo.zPos !== cameraInfo.zPos || camInfo.fov !== cameraInfo.fov) {
		camInfo = cameraInfo;

		setWeatherTime();
		DisplayRadar(false);
		DisplayHud(false);

		if (cam) {
			DestroyAllCams(true);
			DestroyCam(cam, true);
			cam = null;
		}

		freezeRotation = { x: config.greenScreenRotation.x, y: config.greenScreenRotation.y, z: config.greenScreenRotation.z };
		SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
		SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);

		await Delay(50);

		const [playerX, playerY, playerZ] = GetEntityCoords(ped);
		const [fwdX, fwdY, fwdZ] = GetEntityForwardVector(ped);

		const fwdPos = {
			x: playerX + fwdX * 1.2,
			y: playerY + fwdY * 1.2,
			z: playerZ + fwdZ + camInfo.zPos,
		};

		cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', fwdPos.x, fwdPos.y, fwdPos.z, 0, 0, 0, camInfo.fov, true, 0);

		PointCamAtCoord(cam, playerX, playerY, playerZ + camInfo.zPos);
		SetCamActive(cam, true);
		RenderScriptCams(true, false, 0, true, false, 0);

		await Delay(200);
	}
}

async function takeScreenshotForTattoo(pedType, zone, tattoo) {
	const filename = `${pedType}_tattoo_${zone}_${tattoo.collection}_${tattoo.overlay}`;

	if (existingScreenshots.has(filename)) return;
	if (tattoo.overlay.toLowerCase().includes('_hair_')) return;

	const cameraInfo = config.cameraSettings.TATTOOS[zone];
	if (!cameraInfo) return;

	await setupTattooCamera(cameraInfo);

	const isBack = cameraInfo.backRotation && tattoo.overlay.toLowerCase().includes('back');
	const rot = isBack ? cameraInfo.backRotation : cameraInfo.rotation;

	freezeRotation = { x: rot.x, y: rot.y, z: rot.z };
	SetEntityRotation(ped, rot.x, rot.y, rot.z, 2, false);

	ClearPedDecorations(ped);
	AddPedDecorationFromHashes(ped, tattoo.collectionHash, tattoo.overlayHash);

	await Delay(200);

	emitNet('takeScreenshot', filename, 'tattoos');
	await Delay(500);
}

async function takeScreenshotForObject(object, hash) {
	setWeatherTime();
	await Delay(500);

	if (cam) {
		DestroyAllCams(true);
		DestroyCam(cam, true);
		cam = null;
	}

	let [[minDimX, minDimY, minDimZ], [maxDimX, maxDimY, maxDimZ]] = GetModelDimensions(hash);
	let modelSize = {
		x: maxDimX - minDimX,
		y: maxDimY - minDimY,
		z: maxDimZ - minDimZ
	}
	let fov = Math.min(Math.max(modelSize.x, modelSize.z) / 0.15 * 10, 60);

	const [objectX, objectY, objectZ] = GetEntityCoords(object, false);
	const [fwdX, fwdY, fwdZ] = GetEntityForwardVector(object);

	const center = {
		x: objectX + (minDimX + maxDimX) / 2,
		y: objectY + (minDimY + maxDimY) / 2,
		z: objectZ + (minDimZ + maxDimZ) / 2,
	}

	const fwdPos = {
		x: center.x + fwdX * 1.2 + Math.max(modelSize.x, modelSize.z) / 2,
		y: center.y + fwdY * 1.2 + Math.max(modelSize.x, modelSize.z) / 2,
		z: center.z + fwdZ,
	};

	cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', fwdPos.x, fwdPos.y, fwdPos.z, 0, 0, 0, fov, true, 0);

	PointCamAtCoord(cam, center.x, center.y, center.z);
	SetCamActive(cam, true);
	RenderScriptCams(true, false, 0, true, false, 0);

	await Delay(50);

	emitNet('takeScreenshot', `${hash}`, 'objects');
	await Delay(2000);
}

async function takeScreenshotForVehicle(vehicle, hash, model) {
	setWeatherTime();
	await Delay(500);

	if (cam) {
		DestroyAllCams(true);
		DestroyCam(cam, true);
		cam = null;
	}

	let [[minDimX, minDimY, minDimZ], [maxDimX, maxDimY, maxDimZ]] = GetModelDimensions(hash);
	let modelSize = {
		x: maxDimX - minDimX,
		y: maxDimY - minDimY,
		z: maxDimZ - minDimZ
	}
	let fov = Math.min(Math.max(modelSize.x, modelSize.y, modelSize.z) / 0.15 * 10, 60);

	const [objectX, objectY, objectZ] = GetEntityCoords(vehicle, false);

	const center = {
		x: objectX + (minDimX + maxDimX) / 2,
		y: objectY + (minDimY + maxDimY) / 2,
		z: objectZ + (minDimZ + maxDimZ) / 2,
	}

	let camPos = {
		x: center.x + (Math.max(modelSize.x, modelSize.y, modelSize.z) + 2) * Math.cos(340),
		y: center.y + (Math.max(modelSize.x, modelSize.y, modelSize.z) + 2) * Math.sin(340),
		z: center.z + modelSize.z / 2,
	}

	cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', camPos.x, camPos.y, camPos.z, 0, 0, 0, fov, true, 0);

	PointCamAtCoord(cam, center.x, center.y, center.z);
	SetCamActive(cam, true);
	RenderScriptCams(true, false, 0, true, false, 0);

	await Delay(50);

	emitNet('takeScreenshot', `${model}`, 'vehicles');
	await Delay(2000);
}

function SetPedOnGround() {
	const [x, y, z] = GetEntityCoords(ped, false);
	const [retval, ground] = GetGroundZFor_3dCoord(x, y, z, 0, false);
	SetEntityCoords(ped, x, y, ground, false, false, false, false);
}

function ClearAllPedProps() {
	for (const prop of Object.keys(config.cameraSettings.PROPS)) {
		ClearPedProp(ped, parseInt(prop));
	}
}

async function ResetPedComponents() {
	if (config.debug) console.log(`DEBUG: Resetting Ped Components`);

	SetPedDefaultComponentVariation(ped);
	await Delay(150);

	SetPedComponentVariation(ped, 0, 0, 0, 0);
	SetPedComponentVariation(ped, 1, 0, 0, 0);
	SetPedComponentVariation(ped, 2, -1, 0, 0);
	SetPedComponentVariation(ped, 7, 0, 0, 0);
	SetPedComponentVariation(ped, 5, 0, 0, 0);
	SetPedComponentVariation(ped, 6, -1, 0, 0);
	SetPedComponentVariation(ped, 9, 0, 0, 0);
	SetPedComponentVariation(ped, 3, -1, 0, 0);
	SetPedComponentVariation(ped, 8, -1, 0, 0);
	SetPedComponentVariation(ped, 4, -1, 0, 0);
	SetPedComponentVariation(ped, 11, -1, 0, 0);
	SetPedHairColor(ped, 45, 15);

	ClearAllPedProps();
}

function setWeatherTime() {
	if (config.debug) console.log(`DEBUG: Setting Weather & Time`);
	SetRainLevel(0.0);
	SetWeatherTypePersist('EXTRASUNNY');
	SetWeatherTypeNow('EXTRASUNNY');
	SetWeatherTypeNowPersist('EXTRASUNNY');
	NetworkOverrideClockTime(18, 0, 0);
	NetworkOverrideClockMillisecondsPerGameMinute(1000000);
}

function stopWeatherResource() {
	if (config.debug) console.log(`DEBUG: Stopping Weather Resource`);
	if ((GetResourceState('qb-weathersync') == 'started') || (GetResourceState('qbx_weathersync') == 'started')) {
		TriggerEvent('qb-weathersync:client:DisableSync');
		return true;
	} else if (GetResourceState('weathersync') == 'started') {
		TriggerEvent('weathersync:toggleSync')
		return true;
	} else if (GetResourceState('esx_wsync') == 'started') {
		SendNUIMessage({ error: 'weathersync' });
		return false;
	} else if (GetResourceState('cd_easytime') == 'started') {
		TriggerEvent('cd_easytime:PauseSync', false)
		return true;
	} else if (GetResourceState('vSync') == 'started' || GetResourceState('Renewed-Weathersync') == 'started') {
		TriggerEvent('vSync:toggle', false)
		return true;
	}
	return true;
}

function startWeatherResource() {
	if (config.debug) console.log(`DEBUG: Starting Weather Resource again`);
	if ((GetResourceState('qb-weathersync') == 'started') || (GetResourceState('qbx_weathersync') == 'started')) {
		TriggerEvent('qb-weathersync:client:EnableSync');
	} else if (GetResourceState('weathersync') == 'started') {
		TriggerEvent('weathersync:toggleSync')
	} else if (GetResourceState('cd_easytime') == 'started') {
		TriggerEvent('cd_easytime:PauseSync', true)
	} else if (GetResourceState('vSync') == 'started' || GetResourceState('Renewed-Weathersync') == 'started') {
		TriggerEvent('vSync:toggle', true)
	}
}

async function LoadComponentVariation(ped, component, drawable, texture) {
	texture = texture || 0;
	if (config.debug) console.log(`DEBUG: Loading Component Variation: ${component} ${drawable} ${texture}`);

	SetPedPreloadVariationData(ped, component, drawable, texture);
	while (!HasPedPreloadVariationDataFinished(ped)) {
		await Delay(50);
	}
	SetPedComponentVariation(ped, component, drawable, texture, 0);
}

async function LoadPropVariation(ped, component, prop, texture) {
	texture = texture || 0;
	if (config.debug) console.log(`DEBUG: Loading Prop Variation: ${component} ${prop} ${texture}`);

	SetPedPreloadPropData(ped, component, prop, texture);
	while (!HasPedPreloadPropDataFinished(ped)) {
		await Delay(50);
	}
	ClearPedProp(ped, component);
	SetPedPropIndex(ped, component, prop, texture, 0);
}

function createGreenScreenVehicle(vehicleHash, vehicleModel) {
	return new Promise(async (resolve) => {
		if (config.debug) console.log(`DEBUG: Spawning Vehicle ${vehicleModel}`);
		const timeout = setTimeout(() => {
			resolve(null);
		}, config.vehicleSpawnTimeout)
		if (!HasModelLoaded(vehicleHash)) {
			RequestModel(vehicleHash);
			while (!HasModelLoaded(vehicleHash)) {
				await Delay(100);
			}
		}
		const vehicle = CreateVehicle(vehicleHash, config.greenScreenVehiclePosition.x, config.greenScreenVehiclePosition.y, config.greenScreenVehiclePosition.z, 0, true, true);
		if (vehicle === 0) {
			clearTimeout(timeout);
			resolve(null);
		}
		clearTimeout(timeout);
		resolve(vehicle);
	});
}

function hidePlayerPed() {
	const playerPed = PlayerPedId();
	SetEntityCoordsNoOffset(playerPed, config.greenScreenHiddenSpot.x, config.greenScreenHiddenSpot.y, config.greenScreenHiddenSpot.z, false, false, false);
	SetEntityVisible(playerPed, false, false);
	FreezeEntityPosition(playerPed, true);
	SetPlayerControl(playerId, false);
	return playerPed;
}

function restorePlayerPed(playerPed) {
	clearTick(tickId);
	ped = playerPed;
	SetEntityVisible(playerPed, true, false);
	FreezeEntityPosition(playerPed, false);
	SetPlayerControl(playerId, true);
	SetPedOnGround();
	startWeatherResource();
	DisplayRadar(true);
	DisplayHud(true);
	SendNUIMessage({ end: true });
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	camInfo = null;
	cam = null;
}

function spawnClonePed(modelHash) {
	const clone = CreatePed(0, modelHash, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, config.greenScreenRotation.z, false, true);
	SetEntityRotation(clone, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
	return clone;
}

RegisterCommand('screenshot', async (source, args) => {
	const modelHashes = [GetHashKey('mp_m_freemode_01'), GetHashKey('mp_f_freemode_01')];

	SendNUIMessage({ start: true });

	if (!stopWeatherResource()) return;
	DisableIdleCamera(true);

	await fetchExistingScreenshots('clothing');
	await Delay(100);

	const playerPed = hidePlayerPed();

	tickId = setTick(() => {
		DisableAllControlActions(0);
	});

	for (const modelHash of modelHashes) {
		if (!IsModelValid(modelHash)) continue;

		if (!HasModelLoaded(modelHash)) {
			RequestModel(modelHash);
			while (!HasModelLoaded(modelHash)) {
				await Delay(100);
			}
		}

		ped = spawnClonePed(modelHash);
		await Delay(150);

		const pedType = modelHash === GetHashKey('mp_m_freemode_01') ? 'male' : 'female';
		startPedFreeze(ped);

		for (const type of Object.keys(config.cameraSettings)) {
			for (const stringComponent of Object.keys(config.cameraSettings[type])) {
				await ResetPedComponents();
				await Delay(150);
				const component = parseInt(stringComponent);

				if (type === 'CLOTHING') {
					const drawableCount = GetNumberOfPedDrawableVariations(ped, component);
					for (let drawable = 0; drawable < drawableCount; drawable++) {
						const textureCount = GetNumberOfPedTextureVariations(ped, component, drawable);
						SendNUIMessage({
							type: config.cameraSettings[type][component].name,
							value: drawable,
							max: drawableCount,
						});
						if (config.includeTextures) {
							for (let texture = 0; texture < textureCount; texture++) {
								await LoadComponentVariation(ped, component, drawable, texture);
								await takeScreenshotForComponent(pedType, type, component, drawable, texture);
							}
						} else {
							await LoadComponentVariation(ped, component, drawable);
							await takeScreenshotForComponent(pedType, type, component, drawable);
						}
					}
				} else if (type === 'PROPS') {
					const propCount = GetNumberOfPedPropDrawableVariations(ped, component);
					for (let prop = 0; prop < propCount; prop++) {
						const textureCount = GetNumberOfPedPropTextureVariations(ped, component, prop);
						SendNUIMessage({
							type: config.cameraSettings[type][component].name,
							value: prop,
							max: propCount,
						});
						if (config.includeTextures) {
							for (let texture = 0; texture < textureCount; texture++) {
								await LoadPropVariation(ped, component, prop, texture);
								await takeScreenshotForComponent(pedType, type, component, prop, texture);
							}
						} else {
							await LoadPropVariation(ped, component, prop);
							await takeScreenshotForComponent(pedType, type, component, prop);
						}
					}
				}
			}
		}

		stopPedFreeze();
		DeleteEntity(ped);
		SetModelAsNoLongerNeeded(modelHash);
	}

	restorePlayerPed(playerPed);
});

RegisterCommand('customscreenshot', async (source, args) => {
	const type = args[2].toUpperCase();
	const component = parseInt(args[0]);
	let drawable = args[1].toLowerCase() == 'all' ? args[1].toLowerCase() : parseInt(args[1]);
	let prop = args[1].toLowerCase() == 'all' ? args[1].toLowerCase() : parseInt(args[1]);
	const gender = args[3].toLowerCase();
	let cameraSettings;

	let modelHashes;

	if (gender == 'male') {
		modelHashes = [GetHashKey('mp_m_freemode_01')];
	} else if (gender == 'female') {
		modelHashes = [GetHashKey('mp_f_freemode_01')];
	} else {
		modelHashes = [GetHashKey('mp_m_freemode_01'), GetHashKey('mp_f_freemode_01')];
	}

	if (args[4] != null) {
		let cameraSettings = ''
		for (let i = 4; i < args.length; i++) {
			cameraSettings += args[i] + ' ';
		}
		cameraSettings = JSON.parse(cameraSettings);
	}

	if (!stopWeatherResource()) return;
	DisableIdleCamera(true);

	await fetchExistingScreenshots('clothing');
	await Delay(100);

	const playerPed = hidePlayerPed();

	tickId = setTick(() => {
		DisableAllControlActions(0);
	});

	for (const modelHash of modelHashes) {
		if (!IsModelValid(modelHash)) continue;

		if (!HasModelLoaded(modelHash)) {
			RequestModel(modelHash);
			while (!HasModelLoaded(modelHash)) {
				await Delay(100);
			}
		}

		ped = spawnClonePed(modelHash);
		await Delay(150);

		const pedType = modelHash === GetHashKey('mp_m_freemode_01') ? 'male' : 'female';
		startPedFreeze(ped);

		ResetPedComponents();
		await Delay(150);

		if (drawable == 'all') {
			SendNUIMessage({ start: true });

			if (type === 'CLOTHING') {
				const drawableCount = GetNumberOfPedDrawableVariations(ped, component);
				for (drawable = 0; drawable < drawableCount; drawable++) {
					const textureCount = GetNumberOfPedTextureVariations(ped, component, drawable);
					SendNUIMessage({
						type: config.cameraSettings[type][component].name,
						value: drawable,
						max: drawableCount,
					});
					if (config.includeTextures) {
						for (let texture = 0; texture < textureCount; texture++) {
							await LoadComponentVariation(ped, component, drawable, texture);
							await takeScreenshotForComponent(pedType, type, component, drawable, texture, cameraSettings);
						}
					} else {
						await LoadComponentVariation(ped, component, drawable);
						await takeScreenshotForComponent(pedType, type, component, drawable, null, cameraSettings);
					}
				}
			} else if (type === 'PROPS') {
				const propCount = GetNumberOfPedPropDrawableVariations(ped, component);
				for (prop = 0; prop < propCount; prop++) {
					const textureCount = GetNumberOfPedPropTextureVariations(ped, component, prop);
					SendNUIMessage({
						type: config.cameraSettings[type][component].name,
						value: prop,
						max: propCount,
					});
					if (config.includeTextures) {
						for (let texture = 0; texture < textureCount; texture++) {
							await LoadPropVariation(ped, component, prop, texture);
							await takeScreenshotForComponent(pedType, type, component, prop, texture, cameraSettings);
						}
					} else {
						await LoadPropVariation(ped, component, prop);
						await takeScreenshotForComponent(pedType, type, component, prop, null, cameraSettings);
					}
				}
			}
		} else if (!isNaN(drawable)) {
			if (type === 'CLOTHING') {
				const textureCount = GetNumberOfPedTextureVariations(ped, component, drawable);
				if (config.includeTextures) {
					for (let texture = 0; texture < textureCount; texture++) {
						await LoadComponentVariation(ped, component, drawable, texture);
						await takeScreenshotForComponent(pedType, type, component, drawable, texture, cameraSettings);
					}
				} else {
					await LoadComponentVariation(ped, component, drawable);
					await takeScreenshotForComponent(pedType, type, component, drawable, null, cameraSettings);
				}
			} else if (type === 'PROPS') {
				const textureCount = GetNumberOfPedPropTextureVariations(ped, component, prop);
				if (config.includeTextures) {
					for (let texture = 0; texture < textureCount; texture++) {
						await LoadPropVariation(ped, component, prop, texture);
						await takeScreenshotForComponent(pedType, type, component, prop, texture, cameraSettings);
					}
				} else {
					await LoadPropVariation(ped, component, prop);
					await takeScreenshotForComponent(pedType, type, component, prop, null, cameraSettings);
				}
			}
		}

		stopPedFreeze();
		DeleteEntity(ped);
		SetModelAsNoLongerNeeded(modelHash);
	}

	restorePlayerPed(playerPed);
});

RegisterCommand('screenshotobject', async (source, args) => {
	let modelHash = isNaN(Number(args[0])) ? GetHashKey(args[0]) : Number(args[0]);
	const ped = GetPlayerPed(-1);

	if (IsWeaponValid(modelHash)) {
		modelHash = GetWeapontypeModel(modelHash);
	}

	if (!stopWeatherResource()) return;
	DisableIdleCamera(true);

	await Delay(100);

	if (IsModelValid(modelHash)) {
		if (!HasModelLoaded(modelHash)) {
			RequestModel(modelHash);
			while (!HasModelLoaded(modelHash)) {
				await Delay(100);
			}
		}
	} else {
		console.log('ERROR: Invalid object model');
		return;
	}

	SetEntityCoords(ped, config.greenScreenHiddenSpot.x, config.greenScreenHiddenSpot.y, config.greenScreenHiddenSpot.z, false, false, false);
	SetPlayerControl(playerId, false);

	if (config.debug) console.log(`DEBUG: Spawning Object ${modelHash}`);

	const object = CreateObjectNoOffset(modelHash, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, true, true);
	SetEntityRotation(object, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
	FreezeEntityPosition(object, true);

	await Delay(50);
	await takeScreenshotForObject(object, modelHash);

	DeleteEntity(object);
	SetPlayerControl(playerId, true);
	SetModelAsNoLongerNeeded(modelHash);
	startWeatherResource();
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	cam = null;
});

RegisterCommand('screenshotvehicle', async (source, args) => {
	const vehicles = (config.useQBVehicles && QBCore != null) ? Object.keys(QBCore.Shared.Vehicles) : GetAllVehicleModels();
	const ped = PlayerPedId();
	const type = args[0].toLowerCase();
	const primarycolor = args[1] ? parseInt(args[1]) : null;
	const secondarycolor = args[2] ? parseInt(args[2]) : null;

	if (!stopWeatherResource()) return;

	DisableIdleCamera(true);
	SetEntityCoords(ped, config.greenScreenHiddenSpot.x, config.greenScreenHiddenSpot.y, config.greenScreenHiddenSpot.z, false, false, false);
	SetPlayerControl(playerId, false);
	ClearAreaOfVehicles(config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, 10, false, false, false, false, false);

	await Delay(100);

	if (type === 'all') {
		SendNUIMessage({ start: true });

		for (const vehicleModel of vehicles) {
			const vehicleHash = GetHashKey(vehicleModel);
			if (!IsModelValid(vehicleHash)) continue;

			const vehicleClass = GetVehicleClassFromName(vehicleHash);
			if (!config.includedVehicleClasses[vehicleClass]) {
				SetModelAsNoLongerNeeded(vehicleHash);
				continue;
			}

			SendNUIMessage({
				type: vehicleModel,
				value: vehicles.indexOf(vehicleModel) + 1,
				max: vehicles.length + 1
			});

			const vehicle = await createGreenScreenVehicle(vehicleHash, vehicleModel);
			if (vehicle === 0 || vehicle === null) {
				SetModelAsNoLongerNeeded(vehicleHash);
				console.log(`ERROR: Could not spawn vehicle: ${vehicleModel}`);
				continue;
			}

			SetEntityRotation(vehicle, config.greenScreenVehicleRotation.x, config.greenScreenVehicleRotation.y, config.greenScreenVehicleRotation.z, 0, false);
			FreezeEntityPosition(vehicle, true);
			SetVehicleWindowTint(vehicle, 1);
			if (primarycolor) SetVehicleColours(vehicle, primarycolor, secondarycolor || primarycolor);

			await Delay(50);
			await takeScreenshotForVehicle(vehicle, vehicleHash, vehicleModel);

			DeleteEntity(vehicle);
			SetModelAsNoLongerNeeded(vehicleHash);
		}

		SendNUIMessage({ end: true });
	} else {
		const vehicleModel = type;
		const vehicleHash = GetHashKey(vehicleModel);

		if (IsModelValid(vehicleHash)) {
			SendNUIMessage({
				type: vehicleModel,
				value: vehicles.indexOf(vehicleModel) + 1,
				max: vehicles.length + 1
			});

			const vehicle = await createGreenScreenVehicle(vehicleHash, vehicleModel);
			if (vehicle === 0 || vehicle === null) {
				SetModelAsNoLongerNeeded(vehicleHash);
				console.log(`ERROR: Could not spawn vehicle: ${vehicleModel}`);
				return;
			}

			SetEntityRotation(vehicle, config.greenScreenVehicleRotation.x, config.greenScreenVehicleRotation.y, config.greenScreenVehicleRotation.z, 0, false);
			FreezeEntityPosition(vehicle, true);
			SetVehicleWindowTint(vehicle, 1);
			if (primarycolor) SetVehicleColours(vehicle, primarycolor, secondarycolor || primarycolor);

			await Delay(50);
			await takeScreenshotForVehicle(vehicle, vehicleHash, vehicleModel);

			DeleteEntity(vehicle);
			SetModelAsNoLongerNeeded(vehicleHash);
		} else {
			console.log('ERROR: Invalid vehicle model');
		}
	}

	SetPlayerControl(playerId, true);
	startWeatherResource();
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	cam = null;
});

RegisterCommand('screenshottattoos', async (source, args) => {
	const modelHashes = [GetHashKey('mp_m_freemode_01'), GetHashKey('mp_f_freemode_01')];
	const zones = Object.keys(config.cameraSettings.TATTOOS);

	SendNUIMessage({ start: true });

	if (!stopWeatherResource()) return;
	DisableIdleCamera(true);

	await fetchExistingScreenshots('tattoos');
	await Delay(100);

	const playerPed = hidePlayerPed();

	tickId = setTick(() => {
		DisableAllControlActions(0);
	});

	for (const modelHash of modelHashes) {
		if (!IsModelValid(modelHash)) continue;

		if (!HasModelLoaded(modelHash)) {
			RequestModel(modelHash);
			while (!HasModelLoaded(modelHash)) {
				await Delay(100);
			}
		}

		ped = spawnClonePed(modelHash);
		await Delay(1000);
		const hb = config.tattooHeadBlend || { shapeId: 2, skinId: 0, mix: 0.5 };
		SetPedHeadBlendData(ped, hb.shapeId, hb.shapeId, 0, hb.skinId, hb.skinId, 0, hb.mix, hb.mix, 0.0, false);
		await Delay(500);

		const pedType = modelHash === GetHashKey('mp_m_freemode_01') ? 'male' : 'female';
		const genderFilter = pedType === 'male' ? 'GENDER_MALE' : 'GENDER_FEMALE';

		startPedFreeze(ped);
		stripPedForTattoos(ped);
		await Delay(300);

		for (const zone of zones) {
			const zoneTattoos = (tattooData[zone] || []).filter(t =>
				t.gender === genderFilter || t.gender === 'GENDER_DONTCARE'
			);

			if (zoneTattoos.length === 0) continue;

			camInfo = null;

			for (let i = 0; i < zoneTattoos.length; i++) {
				const tattoo = zoneTattoos[i];

				SendNUIMessage({
					type: `${config.cameraSettings.TATTOOS[zone].name} Tattoos`,
					value: i + 1,
					max: zoneTattoos.length,
				});

				await takeScreenshotForTattoo(pedType, zone, tattoo);
			}

			ClearPedDecorations(ped);
		}

		stopPedFreeze();
		DeleteEntity(ped);
		SetModelAsNoLongerNeeded(modelHash);
	}

	restorePlayerPed(playerPed);
});

setImmediate(() => {
	emit('chat:addSuggestions', [
		{
			name: '/screenshot',
			help: 'generate clothing screenshots',
		},
		{
			name: '/customscreenshot',
			help: 'generate custom clothing screenshots',
			params: [
				{ name: "component", help: "The clothing component to take a screenshot of" },
				{ name: "drawable/all", help: "The drawable variation to take a screenshot of" },
				{ name: "props/clothing", help: "PROPS or CLOTHING" },
				{ name: "male/female/both", help: "The gender to take a screenshot of" },
				{ name: "camera settings", help: "The camera settings to use for the screenshot (optional)" },
			]
		},
		{
			name: '/screenshotobject',
			help: 'generate object screenshots',
			params: [
				{ name: "object", help: "The object hash to take a screenshot of" },
			]
		},
		{
			name: '/screenshotvehicle',
			help: 'generate vehicle screenshots',
			params: [
				{ name: "model/all", help: "The vehicle model or 'all' to take a screenshot of all vehicles" },
				{ name: "primarycolor", help: "The primary vehicle color (optional)" },
				{ name: "secondarycolor", help: "The secondary vehicle color (optional)" },
			]
		},
		{
			name: '/screenshottattoos',
			help: 'generate tattoo screenshots for all body zones',
		}
	])
});

on('onResourceStop', (resName) => {
	if (GetCurrentResourceName() != resName) return;

	startWeatherResource();
	DisplayRadar(true);
	DisplayHud(true);
	stopPedFreeze();
	if (tickId) clearTick(tickId);
	SetPlayerControl(playerId, true);

	const playerPed = PlayerPedId();
	if (ped && ped !== playerPed && DoesEntityExist(ped)) {
		DeleteEntity(ped);
	}

	SetEntityVisible(playerPed, true, false);
	FreezeEntityPosition(playerPed, false);
});
