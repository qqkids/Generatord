// Functions to save and load the map
"use strict";

// download map as SVG or PNG file
function saveAsImage(type) {
  console.time("saveAsImage");

  // clone svg
  const cloneEl = document.getElementById("map").cloneNode(true);
  cloneEl.id = "fantasyMap";
  document.getElementsByTagName("body")[0].appendChild(cloneEl);
  const clone = d3.select("#fantasyMap");

  if (type === "svg") clone.select("#viewbox").attr("transform", null); // reset transform to show whole map

  // remove unused elements
  if (!clone.select("#terrain").selectAll("use").size()) clone.select("#defs-relief").remove();
  if (!clone.select("#prec").selectAll("circle").size()) clone.select("#prec").remove();
  const removeEmptyGroups = function() {
    let empty = 0;
    clone.selectAll("g").each(function() {
      if (!this.hasChildNodes() || this.style.display === "none") {empty++; this.remove();}
      if (this.hasAttribute("display") && this.style.display === "inline") this.removeAttribute("display");
    });
    return empty;
  }
  while(removeEmptyGroups()) {removeEmptyGroups();}

  // for each g element get inline style
  const emptyG = clone.append("g").node();
  const defaultStyles = window.getComputedStyle(emptyG);
  clone.selectAll("g, #ruler > g > *, #scaleBar > text").each(function(d) {
    const compStyle = window.getComputedStyle(this);
    let style = "";
    for (let i=0; i < compStyle.length; i++) {
      const key = compStyle[i];
      const value = compStyle.getPropertyValue(key);
      // Firefox mask hack
      if (key === "mask-image" && value !== defaultStyles.getPropertyValue(key)) {
        style += "mask-image: url('#land');";
        continue;
      }
      if (key === "cursor") continue; // cursor should be default
      if (this.hasAttribute(key)) continue; // don't add style if there is the same attribute
      if (value === defaultStyles.getPropertyValue(key)) continue;
      style += key + ':' + value + ';';
    }
    if (style != "") this.setAttribute('style', style);
  });
  emptyG.remove();

  // load fonts as dataURI so they will be available in downloaded svg/png
  GFontToDataURI(getFontsToLoad()).then(cssRules => {
    clone.select("defs").append("style").text(cssRules.join('\n'));
    clone.append("metadata").text("<dc:format>image/svg+xml</dc:format>");
    const serialized = (new XMLSerializer()).serializeToString(clone.node());
    const svg_xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>` + serialized;
    clone.remove();
    const blob = new Blob([svg_xml], {type: 'image/svg+xml;charset=utf-8'});
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.target = "_blank";

    if (type === "png") {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = svgWidth * pngResolutionInput.value;
      canvas.height = svgHeight * pngResolutionInput.value;
      const img = new Image();
      img.src = url;
      img.onload = function() {
        window.URL.revokeObjectURL(url);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        link.download = getFileName() + ".png";
        canvas.toBlob(function(blob) {
           link.href = window.URL.createObjectURL(blob);
           document.body.appendChild(link);
           link.click();
           window.setTimeout(function() {
             canvas.remove();
             window.URL.revokeObjectURL(link.href);
           }, 1000);
        });
      }
    } else {
      link.download = getFileName() + ".svg";
      link.href = url;
      document.body.appendChild(link);
      link.click();
      tip(`${link.download} is saved. Open "Downloads" screen (crtl + J) to check`, true, "warning");
    }

    window.setTimeout(function() {
      window.URL.revokeObjectURL(url);
      clearMainTip();
    }, 3000);
    console.timeEnd("saveAsImage");
  });
}

// get non-standard fonts used for labels to fetch them from web
function getFontsToLoad() {
  const webSafe = ["Georgia", "Times+New+Roman", "Comic+Sans+MS", "Lucida+Sans+Unicode", "Courier+New", "Verdana", "Arial", "Impact"];

  const fontsInUse = new Set(); // to store fonts currently in use
  labels.selectAll("g").each(function() {
    const font = this.dataset.font;
    if (!font) return;
    if (webSafe.includes(font)) return; // do not fetch web-safe fonts
    fontsInUse.add(font);
  });
  const legendFont = legend.attr("data-font");
  if (!webSafe.includes(legendFont)) fontsInUse.add();
  return "https://fonts.googleapis.com/css?family=" + [...fontsInUse].join("|");
}

// code from Kaiido's answer https://stackoverflow.com/questions/42402584/how-to-use-google-fonts-in-canvas-when-drawing-dom-objects-in-svg
function GFontToDataURI(url) {
  return fetch(url) // first fecth the embed stylesheet page
    .then(resp => resp.text()) // we only need the text of it
    .then(text => {
      let s = document.createElement('style');
      s.innerHTML = text;
      document.head.appendChild(s);
      const styleSheet = Array.prototype.filter.call(document.styleSheets, sS => sS.ownerNode === s)[0];

      const FontRule = rule => {
        const src = rule.style.getPropertyValue('src');
        const url = src ? src.split('url(')[1].split(')')[0] : "";
        return {rule, src, url: url.substring(url.length - 1, 1)};
      }
      const fontProms = [];

      for (const r of styleSheet.cssRules) {
        let fR = FontRule(r);
        if (!fR.url) continue;

        fontProms.push(
          fetch(fR.url) // fetch the actual font-file (.woff)
          .then(resp => resp.blob())
          .then(blob => {
            return new Promise(resolve => {
              let f = new FileReader();
              f.onload = e => resolve(f.result);
              f.readAsDataURL(blob);
            })
          })
          .then(dataURL => fR.rule.cssText.replace(fR.url, dataURL))
        )
      }
      document.head.removeChild(s); // clean up
      return Promise.all(fontProms); // wait for all this has been done
    });
}

// prepare map data for saving
function getMapData() {
  console.time("createMapDataBlob");

  return new Promise(resolve => {
    const date = new Date();
    const dateString = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
    const license = "File can be loaded in azgaar.github.io/Fantasy-Map-Generator";
    const params = [version, license, dateString, seed, graphWidth, graphHeight].join("|");
    const options = [distanceUnitInput.value, distanceScaleInput.value, areaUnit.value,
      heightUnit.value, heightExponentInput.value, temperatureScale.value,
      barSize.value, barLabel.value, barBackOpacity.value, barBackColor.value,
      barPosX.value, barPosY.value, populationRate.value, urbanization.value,
      mapSizeOutput.value, latitudeOutput.value, temperatureEquatorOutput.value,
      temperaturePoleOutput.value, precOutput.value, JSON.stringify(winds),
      mapName.value].join("|");
    const coords = JSON.stringify(mapCoordinates);
    const biomes = [biomesData.color, biomesData.habitability, biomesData.name].join("|");
    const notesData = JSON.stringify(notes);

    // set transform values to default
    svg.attr("width", graphWidth).attr("height", graphHeight);
    const transform = d3.zoomTransform(svg.node());
    viewbox.attr("transform", null);
    const svg_xml = (new XMLSerializer()).serializeToString(svg.node());

    // restore initial values
    svg.attr("width", svgWidth).attr("height", svgHeight);
    zoom.transform(svg, transform);

    const gridGeneral = JSON.stringify({spacing:grid.spacing, cellsX:grid.cellsX, cellsY:grid.cellsY, boundary:grid.boundary, points:grid.points, features:grid.features});
    const features = JSON.stringify(pack.features);
    const cultures = JSON.stringify(pack.cultures);
    const states = JSON.stringify(pack.states);
    const burgs = JSON.stringify(pack.burgs);
    const religions = JSON.stringify(pack.religions);
    const provinces = JSON.stringify(pack.provinces);

    // store name array only if it is not the same as default
    const defaultNB = Names.getNameBase();
    const namesData = nameBases.map((b,i) => {
      const names = defaultNB[i] && defaultNB[i].join("") === nameBase[i].join("") ? "" : nameBase[i];
      return `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${names}`;
    }).join("/");

    // data format as below
    const data = [params, options, coords, biomes, notesData, svg_xml,
      gridGeneral, grid.cells.h, grid.cells.prec, grid.cells.f, grid.cells.t, grid.cells.temp,
      features, cultures, states, burgs,
      pack.cells.biome, pack.cells.burg, pack.cells.conf, pack.cells.culture, pack.cells.fl,
      pack.cells.pop, pack.cells.r, pack.cells.road, pack.cells.s, pack.cells.state,
      pack.cells.religion, pack.cells.province, pack.cells.crossroad, religions, provinces,
      namesData].join("\r\n");
    const blob = new Blob([data], {type: "text/plain"});

    console.timeEnd("createMapDataBlob");
    resolve(blob);
  });

}

// Download .map file
async function saveMap() {
  if (customization) {tip("Map cannot be saved when edit mode is active, please exit the mode and retry", false, "error"); return;}
  closeDialogs("#alert");

  const blob = await getMapData();
  const URL = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = getFileName() + ".map";
  link.href = URL;
  document.body.appendChild(link);
  link.click();
  tip(`${link.download} is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
  window.setTimeout(() => window.URL.revokeObjectURL(URL), 5000);
}

// download map data as GeoJSON
function saveGeoJSON() {
  alertMessage.innerHTML = `You can export map data in GeoJSON format used in GIS tools such as QGIS.
  Check out <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/GIS-data-export" target="_blank">wiki-page</a> for guidance`;

  $("#alert").dialog({title: "GIS data export", resizable: false, width: "32em", position: {my: "center", at: "center", of: "svg"},
    buttons: {
      Cells: saveGeoJSON_Cells,
      Routes: saveGeoJSON_Roads,
      Rivers: saveGeoJSON_Rivers,
      Markers: saveGeoJSON_Markers,
      Close: function() {$(this).dialog("close");}
    }
  });
}


function saveGeoJSON_Cells() {
  let data = "{ \"type\": \"FeatureCollection\", \"features\": [\n";
  const cells = pack.cells, v = pack.vertices;

  cells.i.forEach(i => {
    data += "{\n   \"type\": \"Feature\",\n   \"geometry\": { \"type\": \"Polygon\", \"coordinates\": [[";
    cells.v[i].forEach(n => {
      let x = mapCoordinates.lonW + (v.p[n][0] / graphWidth) * mapCoordinates.lonT;
      let y = mapCoordinates.latN - (v.p[n][1] / graphHeight) * mapCoordinates.latT; // this is inverted in QGIS otherwise
      data += "["+x+","+y+"],";
    });
    // close the ring
    let x = mapCoordinates.lonW + (v.p[cells.v[i][0]][0] / graphWidth) * mapCoordinates.lonT;
    let y = mapCoordinates.latN - (v.p[cells.v[i][0]][1] / graphHeight) * mapCoordinates.latT; // this is inverted in QGIS otherwise
    data += "["+x+","+y+"]";
    data += "]] },\n   \"properties\": {\n";

    let height = parseInt(getFriendlyHeight([cells.p[i][0],cells.p[i][1]]));

    data += "      \"id\": \""+i+"\",\n";
    data += "      \"height\": \""+height+"\",\n";
    data += "      \"biome\": \""+cells.biome[i]+"\",\n";
    data += "      \"type\": \""+pack.features[cells.f[i]].type+"\",\n";
    data += "      \"population\": \""+getFriendlyPopulation(i)+"\",\n";
    data += "      \"state\": \""+cells.state[i]+"\",\n";
    data += "      \"province\": \""+cells.province[i]+"\",\n";
    data += "      \"culture\": \""+cells.culture[i]+"\",\n";
    data += "      \"religion\": \""+cells.religion[i]+"\"\n";
    data +="   }\n},\n";
  });

  data = data.substring(0, data.length - 2)+"\n"; // remove trailing comma
  data += "]}";

  const dataBlob = new Blob([data], {type: "application/json"});
  const url = window.URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  document.body.appendChild(link);
  link.download = getFileName("Cells") + ".geojson";
  link.href = url;
  link.click();
  window.setTimeout(function() {window.URL.revokeObjectURL(url);}, 2000);
}

function saveGeoJSON_Roads() {
  let data = "{ \"type\": \"FeatureCollection\", \"features\": [\n";

  routes._groups[0][0].childNodes.forEach(n => {
    n.childNodes.forEach(r => {
      data += "{\n   \"type\": \"Feature\",\n   \"geometry\": { \"type\": \"LineString\", \"coordinates\": ";
      data += JSON.stringify(getRoadPoints(r));
      data += " },\n   \"properties\": {\n";
      data += "      \"id\": \""+r.id+"\",\n";
      data += "      \"type\": \""+n.id+"\"\n";
      data +="   }\n},\n";
    });
  });
  data = data.substring(0, data.length - 2)+"\n"; // remove trailing comma
  data += "]}";

  const dataBlob = new Blob([data], {type: "application/json"});
  const url = window.URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  document.body.appendChild(link);
  link.download = getFileName("Routes") + ".geojson";
  link.href = url;
  link.click();
  window.setTimeout(function() {window.URL.revokeObjectURL(url);}, 2000);
}

function saveGeoJSON_Rivers() {
  let data = "{ \"type\": \"FeatureCollection\", \"features\": [\n";

  rivers._groups[0][0].childNodes.forEach(n => {
    data += "{\n   \"type\": \"Feature\",\n   \"geometry\": { \"type\": \"LineString\", \"coordinates\": ";
    data += JSON.stringify(getRiverPoints(n));
    data += " },\n   \"properties\": {\n";
    data += "      \"id\": \""+n.id+"\",\n";
    data += "      \"width\": \""+n.dataset.width+"\",\n";
    data += "      \"increment\": \""+n.dataset.increment+"\"\n";
    data +="   }\n},\n";
  });
  data = data.substring(0, data.length - 2)+"\n"; // remove trailing comma
  data += "]}";

  const dataBlob = new Blob([data], {type: "application/json"});
  const url = window.URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  document.body.appendChild(link);
  link.download = getFileName("Rivers") + ".geojson";
  link.href = url;
  link.click();
  window.setTimeout(function() {window.URL.revokeObjectURL(url);}, 2000);
}

function saveGeoJSON_Markers() {

  let data = "{ \"type\": \"FeatureCollection\", \"features\": [\n";

  markers._groups[0][0].childNodes.forEach(n => {
      let x = mapCoordinates.lonW + (n.dataset.x / graphWidth) * mapCoordinates.lonT;
      let y = mapCoordinates.latN - (n.dataset.y / graphHeight) * mapCoordinates.latT; // this is inverted in QGIS otherwise

      data += "{\n   \"type\": \"Feature\",\n   \"geometry\": { \"type\": \"Point\", \"coordinates\": ["+x+", "+y+"]";
      data += " },\n   \"properties\": {\n";
      data += "      \"id\": \""+n.id+"\",\n";
      data += "      \"type\": \""+n.dataset.id.substring(8)+"\"\n";
      data +="   }\n},\n";

  });
  data = data.substring(0, data.length - 2)+"\n"; // remove trailing comma
  data += "]}";

  const dataBlob = new Blob([data], {type: "application/json"});
  const url = window.URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  document.body.appendChild(link);
  link.download = getFileName("Markers") + ".geojson";
  link.href = url;
  link.click();
  window.setTimeout(function() {window.URL.revokeObjectURL(url);}, 2000);
}

function getRoadPoints(node) {
  let points = [];
  const l = node.getTotalLength();
  const increment = l / Math.ceil(l / 2);
  for (let i=0; i <= l; i += increment) {
    const p = node.getPointAtLength(i);

    let x = mapCoordinates.lonW + (p.x / graphWidth) * mapCoordinates.lonT;
    let y = mapCoordinates.latN - (p.y / graphHeight) * mapCoordinates.latT; // this is inverted in QGIS otherwise

    points.push([x,y]);
  }
  return points;
}

function getRiverPoints(node) {
  let points = [];
  const l = node.getTotalLength() / 2; // half-length
  const increment = 0.25; // defines density of points
  for (let i=l, c=i; i >= 0; i -= increment, c += increment) {
    const p1 = node.getPointAtLength(i);
    const p2 = node.getPointAtLength(c);

    let x = mapCoordinates.lonW + (((p1.x+p2.x)/2) / graphWidth) * mapCoordinates.lonT;
    let y = mapCoordinates.latN - (((p1.y+p2.y)/2) / graphHeight) * mapCoordinates.latT; // this is inverted in QGIS otherwise
    points.push([x,y]);
  }
  return points;
}

async function quickSave() {
  if (customization) {tip("Map cannot be saved when edit mode is active, please exit the mode and retry", false, "error"); return;}
  const blob = await getMapData();
  if (blob) ldb.set("lastMap", blob); // auto-save map
  tip("Map is saved to browser memory", true, "success", 2000);
}

function quickLoad() {
  ldb.get("lastMap", blob => {
    if (blob) {
      loadMapPrompt(blob);
    } else {
      tip("No map stored. Save map to storage first", true, "error", 2000);
      console.error("No map stored");
    }
  });
}

function loadMapPrompt(blob) {
  const workingTime = (Date.now() - last(mapHistory).created) / 60000; // minutes
  if (workingTime < 5) {loadLastSavedMap(); return;}

  alertMessage.innerHTML = `Are you sure you want to load saved map?<br>
  All unsaved changes made to the current map will be lost`;
  $("#alert").dialog({resizable: false, title: "Load saved map",
    buttons: {
      Cancel: function() {$(this).dialog("close");},
      Load: function() {loadLastSavedMap(); $(this).dialog("close");}
    }
  });

  function loadLastSavedMap() {
    console.warn("Load last saved map");
    try {
      uploadFile(blob);
    }
    catch(error) {
      console.error(error);
      tip("Cannot load last saved map", true, "error", 2000);
    }
  }
}

const saveReminder = function() {
  if (localStorage.getItem("noReminder")) return;
  const message = ["Please don't forget to save your work as a .map file",
    "Please remember to save work as a .map file",
    "Saving in .map format will ensure your data won't be lost in case of issues",
    "Safety is number one priority. Please save the map",
    "Don't forget to save your map on a regular basis!",
    "Just a gentle reminder for you to save the map",
    "Please don't forget to save your progress (saving as .map is the best option)",
    "Don't want to be reminded about need to save? Press CTRL+Q"];

  saveReminder.reminder = setInterval(() => {
    if (customization) return;
    tip(ra(message), true, "warn", 2500);
  }, 1e6);
  saveReminder.status = 1;
}

saveReminder();

function toggleSaveReminder() {
  if (saveReminder.status) {
    tip("Save reminder is turned off. Press CTRL+Q again to re-initiate", true, "warn", 2000);
    clearInterval(saveReminder.reminder);
    localStorage.setItem("noReminder", true);
    saveReminder.status = 0;
  } else {
    tip("Save reminder is turned on. Press CTRL+Q to turn off", true, "warn", 2000);
    localStorage.removeItem("noReminder");
    saveReminder();
  }
}

function getFileName(dataType) {
  const name = mapName.value;
  const type = dataType ? dataType + " " : "";
  const date = new Date();
  const datFormatter = new Intl.DateTimeFormat("en", {month: "short", day: "numeric"});
  const timeFormatter = new Intl.DateTimeFormat("ru", {hour: "numeric", minute: "numeric"});
  const day = datFormatter.format(date).replace(" ", "");
  const time = timeFormatter.format(date).replace(":", "-");
  return name + " " + type + day + " " + time;
}

function uploadFile(file, callback) {
  uploadFile.timeStart = performance.now();

  const fileReader = new FileReader();
  fileReader.onload = function(fileLoadedEvent) {
    const dataLoaded = fileLoadedEvent.target.result;
    const data = dataLoaded.split("\r\n");

    const mapVersion = data[0].split("|")[0] || data[0];
    if (mapVersion === version) {parseLoadedData(data); return;}

    const archive = "<a href='https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Changelog' target='_blank'>archived version</a>";
    const parsed = parseFloat(mapVersion);
    let message = "", load = false;
    if (isNaN(parsed) || data.length < 26 || !data[5]) {
      message = `The file you are trying to load is outdated or not a valid .map file.
                <br>Please try to open it using an ${archive}`;
    } else if (parsed < 0.7) {
      message = `The map version you are trying to load (${mapVersion}) is too old and cannot be updated to the current version.
                <br>Please keep using an ${archive}`;
    } else {
      load = true;
      message =  `The map version (${mapVersion}) does not match the Generator version (${version}).
                 <br>The map will be auto-updated. In case of issues please keep using an ${archive} of the Generator`;
    }
    alertMessage.innerHTML = message;
    $("#alert").dialog({title: "Version conflict", width: "38em", buttons: {
      OK: function() {$(this).dialog("close"); if (load) parseLoadedData(data);}
    }});
  };

  fileReader.readAsText(file, "UTF-8");
  if (callback) callback();
}

function parseLoadedData(data) {
  try {
    // exit customization
    closeDialogs();
    customization = 0;
    if (customizationMenu.offsetParent) styleTab.click();

    const reliefIcons = document.getElementById("defs-relief").innerHTML; // save relief icons
    const hatching = document.getElementById("hatching").cloneNode(true); // save hatching

    void function parseParameters() {
      const params = data[0].split("|");
      if (params[3]) {seed = params[3]; optionsSeed.value = seed;}
      if (params[4]) graphWidth = +params[4];
      if (params[5]) graphHeight = +params[5];
    }()

    console.group("Loaded Map " + seed);

    void function parseOptions() {
      const options = data[1].split("|");
      if (options[0]) applyOption(distanceUnitInput, options[0]);
      if (options[1]) distanceScaleInput.value = distanceScaleOutput.value = options[1];
      if (options[2]) areaUnit.value = options[2];
      if (options[3]) applyOption(heightUnit, options[3]);
      if (options[4]) heightExponentInput.value = heightExponentOutput.value = options[4];
      if (options[5]) temperatureScale.value = options[5];
      if (options[6]) barSize.value = barSizeOutput.value = options[6];
      if (options[7] !== undefined) barLabel.value = options[7];
      if (options[8] !== undefined) barBackOpacity.value = options[8];
      if (options[9]) barBackColor.value = options[9];
      if (options[10]) barPosX.value = options[10];
      if (options[11]) barPosY.value = options[11];
      if (options[12]) populationRate.value = populationRateOutput.value = options[12];
      if (options[13]) urbanization.value = urbanizationOutput.value = options[13];
      if (options[14]) mapSizeInput.value = mapSizeOutput.value = Math.max(Math.min(options[14], 100), 1);
      if (options[15]) latitudeInput.value = latitudeOutput.value = Math.max(Math.min(options[15], 100), 0);
      if (options[16]) temperatureEquatorInput.value = temperatureEquatorOutput.value = options[16];
      if (options[17]) temperaturePoleInput.value = temperaturePoleOutput.value = options[17];
      if (options[18]) precInput.value = precOutput.value = options[18];
      if (options[19]) winds = JSON.parse(options[19]);
      if (options[20]) mapName.value = options[20];
    }()

    void function parseConfiguration() {
      if (data[2]) mapCoordinates = JSON.parse(data[2]);
      if (data[4]) notes = JSON.parse(data[4]);

      const biomes = data[3].split("|");
      biomesData = applyDefaultBiomesSystem();
      biomesData.color = biomes[0].split(",");
      biomesData.habitability = biomes[1].split(",").map(h => +h);
      biomesData.name = biomes[2].split(",");

      // push custom biomes if any
      for (let i=biomesData.i.length; i < biomesData.name.length; i++) {
        biomesData.i.push(biomesData.i.length);
        biomesData.iconsDensity.push(0);
        biomesData.icons.push([]);
        biomesData.cost.push(50);
      }
    }()

    void function replaceSVG() {
      svg.remove();
      document.body.insertAdjacentHTML("afterbegin", data[5]);
    }()

    void function redefineElements() {
      svg = d3.select("#map");
      defs = svg.select("#deftemp");
      viewbox = svg.select("#viewbox");
      scaleBar = svg.select("#scaleBar");
      legend = svg.select("#legend");
      ocean = viewbox.select("#ocean");
      oceanLayers = ocean.select("#oceanLayers");
      oceanPattern = ocean.select("#oceanPattern");
      lakes = viewbox.select("#lakes");
      landmass = viewbox.select("#landmass");
      texture = viewbox.select("#texture");
      terrs = viewbox.select("#terrs");
      biomes = viewbox.select("#biomes");
      cells = viewbox.select("#cells");
      gridOverlay = viewbox.select("#gridOverlay");
      coordinates = viewbox.select("#coordinates");
      compass = viewbox.select("#compass");
      rivers = viewbox.select("#rivers");
      terrain = viewbox.select("#terrain");
      relig = viewbox.select("#relig");
      cults = viewbox.select("#cults");
      regions = viewbox.select("#regions");
      statesBody = regions.select("#statesBody");
      statesHalo = regions.select("#statesHalo");
      provs = viewbox.select("#provs");
      zones = viewbox.select("#zones");
      borders = viewbox.select("#borders");
      stateBorders = borders.select("#stateBorders");
      provinceBorders = borders.select("#provinceBorders");
      routes = viewbox.select("#routes");
      roads = routes.select("#roads");
      trails = routes.select("#trails");
      searoutes = routes.select("#searoutes");
      temperature = viewbox.select("#temperature");
      coastline = viewbox.select("#coastline");
      prec = viewbox.select("#prec");
      population = viewbox.select("#population");
      labels = viewbox.select("#labels");
      icons = viewbox.select("#icons");
      burgIcons = icons.select("#burgIcons");
      anchors = icons.select("#anchors");
      markers = viewbox.select("#markers");
      ruler = viewbox.select("#ruler");
      fogging = viewbox.select("#fogging");
      debug = viewbox.select("#debug");
      burgLabels = labels.select("#burgLabels");
    }()

    void function parseGridData() {
      grid = JSON.parse(data[6]);
      calculateVoronoi(grid, grid.points);
      grid.cells.h = Uint8Array.from(data[7].split(","));
      grid.cells.prec = Uint8Array.from(data[8].split(","));
      grid.cells.f = Uint16Array.from(data[9].split(","));
      grid.cells.t = Int8Array.from(data[10].split(","));
      grid.cells.temp = Int8Array.from(data[11].split(","));
    }()

    void function parsePackData() {
      pack = {};
      reGraph();
      reMarkFeatures();
      pack.features = JSON.parse(data[12]);
      pack.cultures = JSON.parse(data[13]);
      pack.states = JSON.parse(data[14]);
      pack.burgs = JSON.parse(data[15]);
      pack.religions = data[29] ? JSON.parse(data[29]) : [{i: 0, name: "No religion"}];
      pack.provinces = data[30] ? JSON.parse(data[30]) : [0];

      const cells = pack.cells;
      cells.biome = Uint8Array.from(data[16].split(","));
      cells.burg = Uint16Array.from(data[17].split(","));
      cells.conf = Uint8Array.from(data[18].split(","));
      cells.culture = Uint16Array.from(data[19].split(","));
      cells.fl = Uint16Array.from(data[20].split(","));
      cells.pop = Uint16Array.from(data[21].split(","));
      cells.r = Uint16Array.from(data[22].split(","));
      cells.road = Uint16Array.from(data[23].split(","));
      cells.s = Uint16Array.from(data[24].split(","));
      cells.state = Uint16Array.from(data[25].split(","));
      cells.religion = data[26] ? Uint16Array.from(data[26].split(",")) : new Uint16Array(cells.i.length);
      cells.province = data[27] ? Uint16Array.from(data[27].split(",")) : new Uint16Array(cells.i.length);
      cells.crossroad = data[28] ? Uint16Array.from(data[28].split(",")) : new Uint16Array(cells.i.length);

      if (data[31]) {
        const namesDL = data[31].split("/");
        namesDL.forEach((d, i) => {
          const e = d.split("|");
          if (!e.length) return;
          nameBases[i] = {name:e[0], min:e[1], max:e[2], d:e[3], m:e[4]};
          if(e[5]) nameBase[i] = e[5].split(",");
        });
      }
    }()

    void function restoreLayersState() {
      if (texture.style("display") !== "none" && texture.select("image").size()) turnButtonOn("toggleTexture"); else turnButtonOff("toggleTexture");
      if (terrs.selectAll("*").size()) turnButtonOn("toggleHeight"); else turnButtonOff("toggleHeight");
      if (biomes.selectAll("*").size()) turnButtonOn("toggleBiomes"); else turnButtonOff("toggleBiomes");
      if (cells.selectAll("*").size()) turnButtonOn("toggleCells"); else turnButtonOff("toggleCells");
      if (gridOverlay.selectAll("*").size()) turnButtonOn("toggleGrid"); else turnButtonOff("toggleGrid");
      if (coordinates.selectAll("*").size()) turnButtonOn("toggleCoordinates"); else turnButtonOff("toggleCoordinates");
      if (compass.style("display") !== "none" && compass.select("use").size()) turnButtonOn("toggleCompass"); else turnButtonOff("toggleCompass");
      if (rivers.style("display") !== "none") turnButtonOn("toggleRivers"); else turnButtonOff("toggleRivers");
      if (terrain.style("display") !== "none" && terrain.selectAll("*").size()) turnButtonOn("toggleRelief"); else turnButtonOff("toggleRelief");
      if (relig.selectAll("*").size()) turnButtonOn("toggleReligions"); else turnButtonOff("toggleReligions");
      if (cults.selectAll("*").size()) turnButtonOn("toggleCultures"); else turnButtonOff("toggleCultures");
      if (statesBody.selectAll("*").size()) turnButtonOn("toggleStates"); else turnButtonOff("toggleStates");
      if (provs.selectAll("*").size()) turnButtonOn("toggleProvinces"); else turnButtonOff("toggleProvinces");
      if (zones.selectAll("*").size() && zones.style("display") !== "none") turnButtonOn("toggleZones"); else turnButtonOff("toggleZones");
      if (borders.style("display") !== "none") turnButtonOn("toggleBorders"); else turnButtonOff("toggleBorders");
      if (routes.style("display") !== "none" && routes.selectAll("path").size()) turnButtonOn("toggleRoutes"); else turnButtonOff("toggleRoutes");
      if (temperature.selectAll("*").size()) turnButtonOn("toggleTemp"); else turnButtonOff("toggleTemp");
      if (prec.selectAll("circle").size()) turnButtonOn("togglePrec"); else turnButtonOff("togglePrec");
      if (labels.style("display") !== "none") turnButtonOn("toggleLabels"); else turnButtonOff("toggleLabels");
      if (icons.style("display") !== "none") turnButtonOn("toggleIcons"); else turnButtonOff("toggleIcons");
      if (markers.selectAll("*").size() && markers.style("display") !== "none") turnButtonOn("toggleMarkers"); else turnButtonOff("toggleMarkers");
      if (ruler.style("display") !== "none") turnButtonOn("toggleRulers"); else turnButtonOff("toggleRulers");
      if (scaleBar.style("display") !== "none") turnButtonOn("toggleScaleBar"); else turnButtonOff("toggleScaleBar");

      // special case for population bars
      const populationIsOn = population.selectAll("line").size();
      if (populationIsOn) drawPopulation();
      if (populationIsOn) turnButtonOn("togglePopulation"); else turnButtonOff("togglePopulation");

      getCurrentPreset();
    }()

    void function restoreEvents() {
      ruler.selectAll("g").call(d3.drag().on("start", dragRuler));
      ruler.selectAll("text").on("click", removeParent);
      ruler.selectAll("g.ruler circle").call(d3.drag().on("drag", dragRulerEdge));
      ruler.selectAll("g.ruler circle").call(d3.drag().on("drag", dragRulerEdge));
      ruler.selectAll("g.ruler rect").call(d3.drag().on("start", rulerCenterDrag));
      ruler.selectAll("g.opisometer circle").call(d3.drag().on("start", dragOpisometerEnd));
      ruler.selectAll("g.opisometer circle").call(d3.drag().on("start", dragOpisometerEnd));

      scaleBar.on("mousemove", () => tip("Click to open Units Editor"));
      legend.on("mousemove", () => tip("Drag to change the position. Click to hide the legend")).on("click", () => clearLegend());
    }()

    void function resolveVersionConflicts() {
      const version = parseFloat(data[0].split("|")[0]);
      if (version == 0.8) {
        // 0.9 has additional relief icons to be included into older maps
        document.getElementById("defs-relief").innerHTML = reliefIcons;
      }

      if (version < 1) {
        // 1.0 adds a new religions layer
        relig = viewbox.insert("g", "#terrain").attr("id", "relig");
        Religions.generate();

        // 1.0 adds a legend box
        legend = svg.append("g").attr("id", "legend");
        legend.attr("font-family", "Almendra SC").attr("data-font", "Almendra+SC")
          .attr("font-size", 13).attr("data-size", 13).attr("data-x", 99).attr("data-y", 93)
          .attr("stroke-width", 2.5).attr("stroke", "#812929").attr("stroke-dasharray", "0 4 10 4").attr("stroke-linecap", "round");

        // 1.0 separated drawBorders fron drawStates()
        stateBorders = borders.append("g").attr("id", "stateBorders");
        provinceBorders = borders.append("g").attr("id", "provinceBorders");
        borders.attr("opacity", null).attr("stroke", null).attr("stroke-width", null).attr("stroke-dasharray", null).attr("stroke-linecap", null).attr("filter", null);
        stateBorders.attr("opacity", .8).attr("stroke", "#56566d").attr("stroke-width", 1).attr("stroke-dasharray", "2").attr("stroke-linecap", "butt");
        provinceBorders.attr("opacity", .8).attr("stroke", "#56566d").attr("stroke-width", .5).attr("stroke-dasharray", "1").attr("stroke-linecap", "butt");

        // 1.0 adds state relations, provinces, forms and full names
        provs = viewbox.insert("g", "#borders").attr("id", "provs").attr("opacity", .6);
        BurgsAndStates.collectStatistics();
        BurgsAndStates.generateDiplomacy();
        BurgsAndStates.defineStateForms();
        drawStates();
        BurgsAndStates.generateProvinces();
        drawBorders();
        if (!layerIsOn("toggleBorders")) $('#borders').fadeOut();
        if (!layerIsOn("toggleStates")) regions.attr("display", "none").selectAll("path").remove();

        // 1.0 adds hatching
        document.getElementsByTagName("defs")[0].appendChild(hatching);

        // 1.0 adds zones layer
        zones = viewbox.insert("g", "#borders").attr("id", "zones").attr("display", "none");
        zones.attr("opacity", .6).attr("stroke", null).attr("stroke-width", 0).attr("stroke-dasharray", null).attr("stroke-linecap", "butt");
        addZones();
        if (!markers.selectAll("*").size()) {addMarkers(); turnButtonOn("toggleMarkers");}

        // 1.0 add fogging layer (state focus)
        let fogging = viewbox.insert("g", "#ruler").attr("id", "fogging-cont").attr("mask", "url(#fog)")
          .append("g").attr("id", "fogging").attr("display", "none");
        fogging.append("rect").attr("x", 0).attr("y", 0).attr("width", "100%").attr("height", "100%");
        defs.append("mask").attr("id", "fog").append("rect").attr("x", 0).attr("y", 0).attr("width", "100%")
          .attr("height", "100%").attr("fill", "white");

        // 1.0 changes states opacity bask to regions level
        if (statesBody.attr("opacity")) {
          regions.attr("opacity", statesBody.attr("opacity"));
          statesBody.attr("opacity", null);
        }

        // 1.0 changed labels to multi-lined
        labels.selectAll("textPath").each(function() {
          const text = this.textContent;
          const shift = this.getComputedTextLength() / -1.5;
          this.innerHTML = `<tspan x="${shift}">${text}</tspan>`;
        });

        // 1.0 added new biome - Wetland
        biomesData.name.push("Wetland");
        biomesData.color.push("#0b9131");
        biomesData.habitability.push(12);
      }

      if (version == 1) {
        // v 1.0 initial code had a bug with religion layer id
        if (!relig.size()) relig = viewbox.insert("g", "#terrain").attr("id", "relig");

        // v 1.0 initially has Sympathy status then relaced with Friendly
        for (const s of pack.states) {
          if (!s.diplomacy) continue;
          s.diplomacy = s.diplomacy.map(r => r === "Sympathy" ? "Friendly" : r);
        }

        // labels should be toggled via style attribute, so remove display attribute
        labels.attr("display", null);

        // v 1.0 added religions heirarchy tree
        if (pack.religions[1] && !pack.religions[1].code) {
          pack.religions.filter(r => r.i).forEach(r => {
            r.origin = 0;
            r.code = r.name.slice(0, 2);
          });
        }

        // v 1.1 added new lake and coast groups
        if (!document.getElementById("sinkhole")) {
          lakes.append("g").attr("id", "sinkhole");
          lakes.append("g").attr("id", "frozen");
          lakes.append("g").attr("id", "lava");
          lakes.select("#sinkhole").attr("opacity", 1).attr("fill", "#5bc9fd").attr("stroke", "#53a3b0").attr("stroke-width", .7).attr("filter", null);
          lakes.select("#frozen").attr("opacity", .95).attr("fill", "#cdd4e7").attr("stroke", "#cfe0eb").attr("stroke-width", 0).attr("filter", null);
          lakes.select("#lava").attr("opacity", .7).attr("fill", "#90270d").attr("stroke", "#f93e0c").attr("stroke-width", 2).attr("filter", "url(#crumpled)");

          coastline.append("g").attr("id", "sea_island");
          coastline.append("g").attr("id", "lake_island");
          coastline.select("#sea_island").attr("opacity", .5).attr("stroke", "#1f3846").attr("stroke-width", .7).attr("filter", "url(#dropShadow)");
          coastline.select("#lake_island").attr("opacity", 1).attr("stroke", "#7c8eaf").attr("stroke-width", .35).attr("filter", null);
        }

        // v 1.1 features stores more data
        defs.select("#land").selectAll("path").remove();
        defs.select("#water").selectAll("path").remove();
        coastline.selectAll("path").remove();
        lakes.selectAll("path").remove();
        drawCoastline();
      }
    }()

    changeMapSize();
    if (window.restoreDefaultEvents) restoreDefaultEvents();
    invokeActiveZooming();

    console.warn(`TOTAL: ${rn((performance.now()-uploadFile.timeStart)/1000,2)}s`);
    showStatistics();
    console.groupEnd("Loaded Map " + seed);
    tip("Map is successfully loaded", true, "success", 7000);
  }
  catch(error) {
    console.error(error);
    clearMainTip();

    alertMessage.innerHTML = `An error is occured on map loading. Select a different file to load,
      <br>generate a new random map or cancel the loading
      <p id="errorBox">${parseError(error)}</p>`;
    $("#alert").dialog({
      resizable: false, title: "Loading error", maxWidth:"50em", buttons: {
        "Select file": function() {$(this).dialog("close"); mapToLoad.click();},
        "New map": function() {$(this).dialog("close"); regenerateMap();},
        Cancel: function() {$(this).dialog("close")}
      }, position: {my: "center", at: "center", of: "svg"}
    });
  }

}
