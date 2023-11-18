(function () {
  const path = require('path');
  
  var DEBUG_MODE = true;

  var img_data = [];
  var home_path = require('os').homedir();
  var config = {
    width: 64,
    height: 64,
    export_path: path.join(home_path, 'Downloads', 'itemizer')
  };

  var progressObj = {
    value: 0,
    add(addition) {
      addition == 0 ? this.value = addition : this.value = this.value + addition;
      Blockbench.setProgress(this.value);
    }
  }
  Plugin.register('item_screenshoter', {
    title: 'Item Textures',
    author: 'DomasJar',
    description: 'This plugin can make item textures for models',
    icon: 'fa-box',
    version: '0.0.1',
    variant: 'desktop',
    about: "This plugin can make item textures for models",
    tags: ["Minecraft: Bedrock Edition"],
    onload() {
      btn_manual_batch = new Action('itemize_manual_batch', {
        name: 'Manual Batch',
        description: 'Package',
        icon: 'fa-box',
        click: function () {
          ManualBatchDialog().show();
        }
      });
      btn_auto_batch = new Action('itemize_auto_batch', {
        name: 'Auto Batch',
        description: 'Package',
        icon: 'fa-box',
        click: function () {
          AutoBatchDialog().show();
        }
      });
      btn_current = new Action('itemize_current', {
        name: 'Current',
        description: 'Package',
        icon: 'fa-box',
        click: function () {
          exportCurrentModel();
        }
      });
      btn_submenu = new Action('itemizer_menu', {
        children: [btn_current, btn_manual_batch, btn_auto_batch],
        name: 'Itemizer',
        description: 'Menu',
        icon: 'fa-box'
      });
      MenuBar.addAction(btn_submenu, 'filter');
    },
    onunload() {
      btn_manual_batch.delete();
      btn_auto_batch.delete();
      btn_current.delete();
      btn_submenu.delete();
    }
  })

  function ManualBatchDialog() {
    var dialog = new Dialog({
      id: 'item_screenshoter_dialog',
      title: 'Item Screenshoter', 
      lines: [`
        <style>
          dialog#item_screenshoter_dialog .div {
            cursor: pointer;
          }
        </style>
      `],
      component: {
        data: {
          models: [],
          model: {
            texture_path: '',
            geometry_path: '',
            get name() {
              return path.parse(path.basename(this.geometry_path, path.extname(this.geometry_path))).name
            } 
          }
        },
        methods: {
          addModel() {
            this.models.push(Object.assign({}, this.model));
            this.model.texture_path = '';
            this.model.geometry_path = '';
          },
          setGeometry(e) {
            var files = e.target.files || e.dataTransfer.files;
            if (!files.length)
              return;
            this.model.geometry_path = files[0].path
          },
          setTexture(e) {
            var files = e.target.files || e.dataTransfer.files;
            if (!files.length)
              return;
            this.model.texture_path = files[0].path
          },
          chooseGeometry() {
            document.getElementById("geoFile").click()
          },
          chooseTexture() {
            document.getElementById("texFile").click()
          },
        },
        template: `
          <div>
            <div class="dialog_bar form_bar form_bar_file"> 
              <input id="geoFile" type="file" accept=".geo.json" @change="setGeometry" hidden>
              
              <label class="name_space_left" for="geoFileText">Geometry File:</label>
              <div class="input_wrapper test" @click="chooseGeometry">
                <input class="dark_bordered half" id="geoFileText" type="text" v-model="this.model.geometry_path" disabled>
                <i class="material-icons">folder</i>
              </div>
            </div>
            <div class="dialog_bar form_bar form_bar_file">
              <input id="texFile" type="file" accept=".png" @change="setTexture" hidden>
              
              <label class="name_space_left" for="texFileText">Texture File:</label>
              <div class="input_wrapper" @click="chooseTexture">
                <input class="dark_bordered half" id="texFileText" type="text" v-model="this.model.texture_path" disabled>
                <i class="material-icons">folder</i>
              </div>
            </div>
            <div>
              <button @click="addModel">Add</button>
            </div>
            <ul>
              <li v-for="model in models">{{model.name}}</li>
            </ul>
          </div>
        `
      },
      onConfirm: async function (formData) {
        // debugger;
        if (validateInput(dialog.content_vue.models)){
          this.hide();
          for (m of dialog.content_vue.models){
            await loadModel(m);
            const BBox = getBoundingBox();
            await captureScreenshot(BBox);
            await writeFiles(m);
          }
          Blockbench.notification('Item Screenshoter', 'Finished');
        } else {
          Blockbench.showQuickMessage("Invalid input data")
        }
      },
      onCancel: function (formData) {
        this.hide();
      }
    });
    return dialog;
  }

  function AutoBatchDialog() {
    var dialog = new Dialog({
      id: 'item_screenshoter_dialog',
      title: 'Item Screenshoter',
      lines: [`
        <style>
          dialog#item_screenshoter_dialog .div {
            cursor: pointer;
          }
        </style>
      `],
      component: {
        data: {
          models: [],
          geometry_dir: '',
          texture_dir: ''
        },
        methods: {
          scanFolders() {
            var geos = walkSync(this.geometry_dir).filter(path => path.includes('.geo.json'));
            var textures = walkSync(this.texture_dir).filter(path => path.includes('.png'));
            for (const geo of geos) {
              const name = path.basename(geo, '.geo.json');
              const texture = textures.find(tex => similarity(path.basename(tex, '.png'), name) > 0.8);
              if(texture){
                console.log(name);
                this.models.push({
                  texture_path: texture,
                  geometry_path: geo,
                  name
                })
              }
            }
          },
          setGeometryDir(e) {
            let dir = electron.dialog.showOpenDialogSync({
              properties: ["openDirectory"]
            });
            if (dir) this.geometry_dir = dir[0];
          },
          setTextureDir(e) {
            let dir = electron.dialog.showOpenDialogSync({
              properties: ["openDirectory"]
            });
            if (dir) this.texture_dir = dir[0];
          },
        },
        template: `
          <div>
            <div class="dialog_bar form_bar form_bar_file"> 
              <label class="name_space_left" for="geoFileText">Geometry Folder:</label>
              <div class="input_wrapper test" @click="setGeometryDir">
                <input class="dark_bordered half" id="geoFileText" type="text" v-model="this.geometry_dir" disabled>
                <i class="material-icons">folder</i>
              </div>
            </div>
            <div class="dialog_bar form_bar form_bar_file">
              <label class="name_space_left" for="texFileText">Texture Folder:</label>
              <div class="input_wrapper" @click="setTextureDir">
                <input class="dark_bordered half" id="texFileText" type="text" v-model="this.texture_dir" disabled>
                <i class="material-icons">folder</i>
              </div>
            </div>
            <div>
              <button @click="scanFolders">Scan</button>
            </div>
            <ul>
              <li v-for="model in models">{{model.name}}</li>
            </ul>
          </div>
        `
      },
      onConfirm: async function (formData) {
        // debugger;
        if (validateInput(dialog.content_vue.models)){
          this.hide();
          for (m of dialog.content_vue.models){
            await loadModel(m);
            const BBox = getBoundingBox();
            await captureScreenshot(BBox);
            await writeFiles(m);
          }
          Blockbench.notification('Item Screenshoter', 'Finished');
        } else {
          Blockbench.showQuickMessage("Invalid input data")
        }
      },
      onCancel: function (formData) {
        this.hide();
      }
    });
    return dialog;
  }

  async function exportCurrentModel() {
    if (Project == 0) {
      Blockbench.showQuickMessage("No open project"); 
      return;
    }
    if (Project.textures.length == 0) {
      Blockbench.showQuickMessage("No Texture"); 
      return;
    }
    if (Cube.all.length == 0) {
      Blockbench.showQuickMessage("No Cubes");
      return;
    }
    if (Project.selected_texture === null || Project.selected_texture === undefined) Project.textures[0].select()

    const BBox = getBoundingBox();
    await captureScreenshot(BBox);
    await writeFiles();
    Blockbench.notification('Item Screenshoter', 'Finished');
  }

  function captureScreenshot(BBox) {
    return new Promise( async (resolve, reject) => {
      if (DEBUG_MODE) console.log('start: captureScreenshot');
      var preview = Preview.selected;
      const maxValue = (...array) => {
        let arr = [].concat(...array)
        return arr.reduce((max, val) => Math.abs(val) > max ? max = Math.abs(val) : max)
      }

      let targetPos = [(BBox.minXYZ[0] + BBox.maxXYZ[0]) / 2, (BBox.minXYZ[1] + BBox.maxXYZ[1]) / 2, (BBox.minXYZ[2] + BBox.maxXYZ[2]) / 2];
      let distMultiplier = 1.3;
      let cameraAxisDist = Math.round(maxValue(BBox.maxXYZ, BBox.minXYZ) * distMultiplier);

      if (DEBUG_MODE) console.log(cameraAxisDist);
      if (DEBUG_MODE) console.log(`Zoom: ${preview.camOrtho.zoom}`);

      

      let preset = {
        name: 'item_texturer',
        id: "item_texturer_id",
        projection: 'orthographic',
        position: [-cameraAxisDist, cameraAxisDist, -cameraAxisDist],
        target: [0, (BBox.minXYZ[1] + BBox.maxXYZ[1]) / 2, 0],
        zoom: preview.camOrtho.zoom
      };

      preview.loadAnglePreset(preset);
      console.log(Preview.selected);

      // this.camera.zoom = preset.zoom;
			// this.camera.updateProjectionMatrix()

      let options = {
        crop: false,
        width: config.width,
        height: config.height
      };
      
      const takeScreenshot = async (options) => {
        return new Promise( (resolve, reject) => {
          preview.screenshot(options, (img) => {
            if (!img) {
              return reject('error while capturing screenshot');
            }
            resolve(img);
          });
        })
      }

      const img = await takeScreenshot(options).catch(console.error);
      let base64Image = img.split(';base64,').pop();
      img_data.push(base64Image);

      if (DEBUG_MODE) console.log('end: captureScreenshot');
      return resolve()
    });

  }

  function writeFiles(name) {
    return new Promise( async (resolve, reject) => {
      if (DEBUG_MODE) console.log('start: writeFiles');

      
      if (!fs.existsSync(config.export_path)){
        fs.mkdirSync(config.export_path);
      }
      // Write screenshot images
      for (const img of img_data) {
        let full_image_path = path.join(config.export_path, (Project.model_identifier  + ".png"))

        fs.writeFileSync(full_image_path, img, { encoding: 'base64' }, (err) => {
          if (err) console.error(err);
        });
        if (DEBUG_MODE) console.log("Written " + full_image_path);

      }

      img_data = [];

      if (DEBUG_MODE) console.log('end: writeFiles');
      return resolve()
    });
  }

  function loadModel(data) {
    return new Promise( async (resolve, reject) => {
      if (DEBUG_MODE) console.log('start: loadModel');
      const readModelAsync = async (modelPath) => {
        return new Promise( (resolve, reject) => {
          
          let options = {
            readtype: "text"
          };
          Blockbench.read(modelPath, options, function(files){
            if (!files) {
              return reject('error while reading model file');
            }
            resolve(files);
          });
        })
      }

      
      let geo = await readModelAsync(data.geometry_path)
      
      if (DEBUG_MODE) console.log(geo);
      loadModelFile(geo[0]);

      let tex = new Texture().fromPath(data.texture_path).add(false).fillParticle();
      Canvas.updateLayeredTextures();
      if (DEBUG_MODE) console.log(tex);
      setTimeout(() => {
        if (DEBUG_MODE) console.log('end: loadModel');
        return resolve()
        
      }, 100);
    });
  }

  function getBoundingBox() {
    let minXYZ = [0, 0, 0];
    let maxXYZ = [0, 0, 0];
    if (DEBUG_MODE) console.log(Cube.all[0]);
    for (const cube of Cube.all) {
      if (cube.from[0] < minXYZ[0]) minXYZ[0] = cube.from[0];
      if (cube.from[1] < minXYZ[1]) minXYZ[1] = cube.from[1];
      if (cube.from[2] < minXYZ[2]) minXYZ[2] = cube.from[2];

      if (cube.to[0] > maxXYZ[0]) maxXYZ[0] = cube.to[0];
      if (cube.to[1] > maxXYZ[1]) maxXYZ[1] = cube.to[1];
      if (cube.to[2] > maxXYZ[2]) maxXYZ[2] = cube.to[2];
    }

    if (DEBUG_MODE) console.log({minXYZ, maxXYZ});

    return {minXYZ, maxXYZ}
  }

  function walkSync(dir) {
    var allFiles = [];
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) {
        allFiles.push(...walkSync(path.join(dir, file.name)));
      } else {
        allFiles.push(path.join(dir, file.name));
      }
    }
    return allFiles;
  }

  function validateInput(models) {
    if (models.length == 0) {
      return false
    }
    return true
  }

  function similarity(s1, s2) {
    var longer = s1;
    var shorter = s2;
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    var longerLength = longer.length;
    if (longerLength == 0) {
      return 1.0;
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
  }

  function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
  
    var costs = new Array();
    for (var i = 0; i <= s1.length; i++) {
      var lastValue = i;
      for (var j = 0; j <= s2.length; j++) {
        if (i == 0)
          costs[j] = j;
        else {
          if (j > 0) {
            var newValue = costs[j - 1];
            if (s1.charAt(i - 1) != s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue),
                costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0)
        costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }
})();