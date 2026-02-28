# fivem-greenscreener

Automated GTA V screenshot tool for FiveM. Captures every clothing item, prop, tattoo, object, and vehicle against a green screen, then processes them into transparent PNGs.

Fork of [Bentix's fivem-greenscreener](https://github.com/Bentix-cs/fivem-greenscreener), rewritten by **Moxy**.

## Changes from original

- Way faster per screenshot (~600ms vs ~2.5s) — camera gets reused between similar components instead of rebuilding every time
- Proper chroma keying using YCbCr color space instead of the basic `g > r + b` check. Uses flood-fill from edges so green clothing doesn't get removed
- Soft alpha edges instead of hard cutouts, stray pixel clusters get cleaned up automatically
- All images normalized to a consistent square size (512x512 by default)
- Resumes where it left off if you crash or restart
- Uses a cloned ped instead of the player ped so it doesn't mess with your character

## Dependencies

- [screencapture](https://github.com/itschip/screencapture) — drop-in replacement for screenshot-basic. Called via the `screenshot-basic` export since screencapture is backwards compatible
- [jim_g_green_screen](https://github.com/jimgordon20/jim_g_green_screen) — the actual green screen map/MLO where screenshots are taken
- yarn (built into FiveM, handles node_modules)
- [image-js](https://www.npmjs.com/package/image-js) — installed automatically by yarn from package.json

## Install

1. Drop this into your `resources/` folder (not in a subfolder — breaks save paths)
2. Get [screencapture](https://github.com/itschip/screencapture/releases) and drop it in `resources/` too
3. Get [jim_g_green_screen](https://github.com/jimgordon20/jim_g_green_screen) and drop it in `resources/`
4. Add to `server.cfg`:
   ```
   ensure jim_g_green_screen
   ensure screencapture
   ensure fivem-greenscreener
   ```
5. Start your server — yarn installs node deps automatically

## Config

Everything is in `config.json`. Main settings:

- `debug` — verbose console logging
- `includeTextures` — capture every texture variation (way more images)
- `overwriteExistingImages` — set false to enable resume
- `outputImageSize` — square output size in px, or `0` for dynamic crop
- `minClusterSize` — pixel clusters smaller than this get removed as noise
- `useQBVehicles` — use QBCore shared vehicles list instead of native
- `vehicleSpawnTimeout` — max wait time before skipping a vehicle

Camera positions and per-component angles are also in there.

## Commands

### `/screenshot`
Captures all clothing and props for male + female. Takes a while, don't touch your PC.

### `/customscreenshot [component] [drawable/all] [props/clothing] [male/female/both] [camera (optional)]`
```
/customscreenshot 11 all clothing male
/customscreenshot 11 17 clothing male {"fov": 55, "rotation": {"x": 0, "y": 0, "z": 15}, "zPos": 0.26}
```

### `/screenshotobject [hash]`
```
/screenshotobject 2240524752
```

### `/screenshotvehicle [model/all] [primarycolor] [secondarycolor]`
```
/screenshotvehicle all
/screenshotvehicle zentorno 1 1
```
Vehicle colors: [rage.mp Vehicle Colors](https://wiki.rage.mp/index.php?title=Vehicle_Colors)

### `/screenshottattoos`
Captures every tattoo for male + female. Ped gets stripped to minimal clothing so tattoos are visible, camera auto-focuses on the correct body zone.

## Example Output

<p>
<img src="https://r2.fivemanage.com/xtkw44JA8OhwP96WybYNd/whrzRFpgN3tg.png" width="128">
<img src="https://r2.fivemanage.com/xtkw44JA8OhwP96WybYNd/jgrO5H0398hC.png" width="128">
<img src="https://r2.fivemanage.com/xtkw44JA8OhwP96WybYNd/yAXnxmgA91Br.png" width="128">
<img src="https://r2.fivemanage.com/xtkw44JA8OhwP96WybYNd/fjoJ2ZO9YggK.png" width="128">
<img src="https://r2.fivemanage.com/xtkw44JA8OhwP96WybYNd/E7IBJxmYdfhE.png" width="128">
</p>

## File Structure

Saved to `resources/fivem-greenscreener/images/`:
```
images/
  clothing/
    male_1_0.png
    male_prop_0_5.png
    female_11_3.png
  vehicles/
    zentorno.png
  tattoos/
    male_tattoo_ZONE_TORSO_mpChristmas2_TAT_016_M.png
  objects/
    2240524752.png
```

## Component IDs

| ID | Type | Name |
|----|------|------|
| 1 | Clothing | Masks |
| 3 | Clothing | Torsos |
| 4 | Clothing | Legs |
| 5 | Clothing | Bags |
| 6 | Clothing | Shoes |
| 7 | Clothing | Accessories |
| 8 | Clothing | Undershirts |
| 9 | Clothing | Body Armor |
| 11 | Clothing | Tops |
| 0 | Prop | Hats |
| 1 | Prop | Glasses |
| 2 | Prop | Ears |
| 6 | Prop | Watches |
| 7 | Prop | Bracelets |

## Credits

- Original script by [Bentix](https://github.com/Bentix-cs/fivem-greenscreener)
- Green screen box by [jimgordon20](https://github.com/jimgordon20/jim_g_green_screen)
- [screencapture](https://github.com/itschip/screencapture) by itschip
