<script setup>
import { open } from '@tauri-apps/api/dialog';
import { audioDir, documentDir } from '@tauri-apps/api/path';
import { platform } from '@tauri-apps/api/os';
import { readBinaryFile, readDir, writeBinaryFile } from '@tauri-apps/api/fs';
import {
  computed,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { read, utils } from 'xlsx';
import MP3Tag from 'mp3tag.js';

import Helpers from '../classes/Helpers.js';
import {
  mp3TypeFilters,
  xlsTypeFilters,
  STATUS_WAITING,
  STATUS_PROCESSING,
  STATUS_ERROR,
  STATUS_SUCCESS,
} from '../enums/mp3Tags.js';

const testText = ref('');
const selectedExcelFile = ref('');
const selectedMp3Folder = ref([]);
const excelData = shallowRef([]);
const platformName = ref(null);
const mp3Files = ref([]);
const loaderIsVisible = ref(false);
const settingsIsVisible = ref(false);
const checkAllMp3 = ref(true);
const selectedMp3FileIndex = ref(null);

const reportData = ref({
  unchecked: 0,
  success: 0,
  error: 0,
  notPaired: 0,
});

let saveOriginalFileStorage = window.localStorage.getItem('saveOriginalFile');
if (!saveOriginalFileStorage) {
  saveOriginalFileStorage = false;
} else {
  saveOriginalFileStorage = parseInt(saveOriginalFileStorage, 10) === 1;
}
const saveOriginalFile = ref(saveOriginalFileStorage);
watch(saveOriginalFile, (newVal) => {
  window.localStorage.setItem('saveOriginalFile', newVal ? '1' : '0');
});

let xlsArtistColNrStorage = window.localStorage.getItem('xlsArtistColNr');
if (!xlsArtistColNrStorage) {
  xlsArtistColNrStorage = 1;
} else {
  xlsArtistColNrStorage = parseInt(xlsArtistColNrStorage, 10);
}
let xlsTitleColNrStorage = window.localStorage.getItem('xlsTitleColNr');
if (!xlsTitleColNrStorage) {
  xlsTitleColNrStorage = 2;
} else {
  xlsTitleColNrStorage = parseInt(xlsTitleColNrStorage, 10);
}
let xlsAlbumColNrStorage = window.localStorage.getItem('xlsAlbumColNr');
if (!xlsAlbumColNrStorage) {
  xlsAlbumColNrStorage = 3;
} else {
  xlsAlbumColNrStorage = parseInt(xlsAlbumColNrStorage, 10);
}
const xlsArtistColNr = ref(xlsArtistColNrStorage);
const xlsTitleColNr = ref(xlsTitleColNrStorage);
const xlsAlbumColNr = ref(xlsAlbumColNrStorage);

watch(xlsArtistColNr, (newVal) => {
  window.localStorage.setItem('xlsArtistColNr', String(newVal));
});
watch(xlsTitleColNr, (newVal) => {
  window.localStorage.setItem('xlsTitleColNr', String(newVal));
});
watch(xlsAlbumColNr, (newVal) => {
  window.localStorage.setItem('xlsAlbumColNr', String(newVal));
});

const mp3FilesHavePairs = computed(() => {
  if (mp3Files.value.length) {
    for (const mp3File of mp3Files.value) {
      if (mp3File.excelRow) { // not null, and > zero, because zero items are header
        return true;
      }
    }
  }
  return false;
});

// Uint8Array to ArrayBuffer
function typedArrayToBuffer(array) {
  return array.buffer.slice(array.byteOffset, array.byteLength + array.byteOffset)
}

async function beginAutoPairForUnpaired() {
  // second chance
  setLoaderWidth(98, 'Wait please...');
  loaderIsVisible.value = true;
  for (let i = 0; i < mp3Files.value.length; i += 1) {
    if (mp3Files.value[i].checked
        && !mp3Files.value[i].excelRow
        && mp3Files.value[i].title
        && mp3Files.value[i].album
        && mp3Files.value[i].artist
    ) {
      const mp3Artist = mp3Files.value[i].artist;
      const mp3Title = mp3Files.value[i].title;
      const mp3Album = mp3Files.value[i].album;
      for (let j = 0; j < excelData.value.length; j += 1) {
        if (j > 0) {
          const xlsArtist = excelData.value[j][xlsArtistColNr.value - 1];
          const xlsTitle = excelData.value[j][xlsTitleColNr.value - 1];
          const xlsAlbum = excelData.value[j][xlsAlbumColNr.value - 1];
          // const eqArtist = Helpers.strEqual(xlsArtis, mp3Artist);
          // const eqTitle = Helpers.strEqual(xlsTitle, mp3Title);
          const eqAlbum = Helpers.strEqual(xlsAlbum, mp3Album);
          const simpleArtistMp3 = Helpers.toLower(mp3Artist);
          const simpleArtistXls = Helpers.toLower(xlsArtist);
          // const simpleAlbumMp3 = Helpers.simpleStr(mp3Album);
          // const simpleAlbumXls = Helpers.simpleStr(xlsAlbum);
          const simpleTitleMp3 = Helpers.toLower(mp3Title);
          const simpleTitleXls = Helpers.toLower(xlsTitle);

          if (
              (eqAlbum && simpleArtistMp3.indexOf(simpleArtistXls) > -1 && simpleTitleMp3.indexOf(simpleTitleXls) > -1)
              ||
              (eqAlbum && simpleArtistMp3.indexOf(simpleArtistXls) > -1 && simpleTitleXls.indexOf(simpleTitleMp3) > -1)
              ||
              (eqAlbum && simpleArtistMp3.indexOf(simpleArtistXls) > -1 && Helpers.calculateCosineSimilarity(simpleTitleMp3, simpleTitleXls) > 75)
              ||
              (eqAlbum && Helpers.calculateCosineSimilarity(simpleArtistMp3, simpleArtistXls) > 70 && Helpers.calculateCosineSimilarity(simpleTitleMp3, simpleTitleXls) > 70)
          ) {
            mp3Files.value[i].excelRow = j;
          }
        }
      }
    }
  }
  setLoaderWidth(0, '');
  loaderIsVisible.value = false;
}

async function beginAutoPair() {
  if (excelData.value.length && mp3Files.value.length) {
    setLoaderWidth(0, '');
    loaderIsVisible.value = true;
    let unpairedExists = false;
    for (let i = 0; i < mp3Files.value.length; i += 1) {
      const loaderWith = 100 * i / mp3Files.value.length;
      setLoaderWidth(loaderWith, loaderWith.toFixed(2) + '% Please wait...<br>Reading MP3 tags and searching for the corresponding row in the XLS file:<br>' + getFileNameFromFilePath(mp3Files.value[i].path));

      if (mp3Files.value[i].checked) {
        /* read data into a Uint8Array */
        const uint8Array = await readBinaryFile(mp3Files.value[i].path);
        const buffer = typedArrayToBuffer(uint8Array);

        const verbose = false;// true // Logs all processes using `console.log`
        const mp3tag = new MP3Tag(buffer, verbose);

        // Read the tags from the buffer
        mp3tag.read({
          id3v1: false // Ignore ID3v1 tags when reading
        });

        // Handle error if there's any
        if (mp3tag.error !== '') {
          mp3Files.value[i].message = mp3tag.error;
          mp3Files.value[i].status = STATUS_ERROR;
        } else {
          // Access ID3v2 Tags
          // Comment Tag. See more ID3v2 tags at id3.org
          // console.log('mp3tag.tags', mp3tag.tags);
          mp3Files.value[i].title = mp3tag.tags.title;
          mp3Files.value[i].album = mp3tag.tags.album;
          mp3Files.value[i].artist = mp3tag.tags.artist;
          // mp3Files.value[i].tags = { ...mp3tag.tags };

          for (let j = 0; j < excelData.value.length; j += 1) {
            if (j > 0) {
              const xlsArtis = excelData.value[j][xlsArtistColNr.value - 1];
              const xlsTitle = excelData.value[j][xlsTitleColNr.value - 1];
              const xlsAlbum = excelData.value[j][xlsAlbumColNr.value - 1];

              const eqArtist = Helpers.strEqual(xlsArtis, mp3tag.tags.artist);
              const eqTitle = Helpers.strEqual(xlsTitle, mp3tag.tags.title);
              const eqAlbum = Helpers.strEqual(xlsAlbum, mp3tag.tags.album);
              const simpleArtistMp3 = Helpers.simpleStr(mp3tag.tags.artist);
              const simpleArtistXls = Helpers.simpleStr(xlsArtis);
              const simpleAlbumMp3 = Helpers.simpleStr(mp3tag.tags.album);
              const simpleAlbumXls = Helpers.simpleStr(xlsAlbum);
              const simpleTitleMp3 = Helpers.simpleStr(mp3tag.tags.title);
              const simpleTitleXls = Helpers.simpleStr(xlsTitle);
              if ((eqArtist && eqTitle && eqAlbum)
                  ||
                  (eqTitle && eqAlbum && simpleArtistMp3.indexOf(simpleArtistXls) > -1)
                  ||
                  (eqTitle && eqAlbum && simpleArtistXls.indexOf(simpleArtistMp3) > -1)
                  ||
                  (eqAlbum && simpleArtistMp3.indexOf(simpleArtistXls) > -1 && simpleTitleMp3.indexOf(simpleTitleXls) > -1)
                  ||
                  (eqAlbum && simpleArtistMp3.indexOf(simpleArtistXls) > -1 && simpleTitleXls.indexOf(simpleTitleMp3) > -1)
              ) {
                mp3Files.value[i].excelRow = j;
              }
            }
          }
        }
      }

      if (mp3Files.value[i].excelRow === null) {
        unpairedExists = true;
        mp3Files.value[i].excelRow = 0; // 0 - show red button "not found"
      }
    }
    loaderIsVisible.value = false;
    if (unpairedExists) {
      await beginAutoPairForUnpaired();
    }
  }
}

async function changeMp3Tags() {
  loaderIsVisible.value = true;
  const report = {
    unchecked: 0,
    success: 0,
    error: 0,
    notPaired: 0,
  };
  reportData.value =  { ...report };

  for (let i = 0; i < mp3Files.value.length; i++) {
    mp3Files.value[i].message = null;
  }

  for (let i = 0; i < mp3Files.value.length; i++) {
    const mp3FilePath = mp3Files.value[i].path;
    let prc = 100 * i / mp3Files.value.length;
    const fileName = getFileNameFromFilePath(mp3FilePath);
    setLoaderWidth(prc, `${prc.toFixed(2)}% - ${fileName}`);
    if (!mp3Files.value[i].checked) {
      report.unchecked += 1;
    } else if (!mp3Files.value[i].excelRow) {
      report.notPaired += 1;
    } else {
      mp3Files.value[i].status = STATUS_PROCESSING;
      /* read data into a Uint8Array */
      const uint8Array = await readBinaryFile(mp3FilePath);
      const buffer = typedArrayToBuffer(uint8Array);

      const verbose = false;// true // Logs all processes using `console.log`
      const mp3tag = new MP3Tag(buffer, verbose);

      // Read the tags from the buffer
      mp3tag.read({
        id3v1: false // Ignore ID3v1 tags when reading
      });

      // Handle error if there's any
      if (mp3tag.error !== '') {
        mp3Files.value[i].message = mp3tag.error;
        mp3Files.value[i].status = STATUS_ERROR;
        report.error += 1;
      } else {
        // Comment Tag. See more ID3v2 tags at id3.org
        const excelRow = mp3Files.value[i].excelRow;

        mp3tag.tags.v2.TXXX = [];
        for (let ii = 0; ii < excelData.value[excelRow].length; ii += 1) {
          mp3tag.tags.v2.TXXX.push({
            description: String(excelData.value[0][ii].trim()),
            text: String(excelData.value[excelRow][ii].trim())
          });
        }

        const arrayBuffer = mp3tag.save({
          strict: true, // Strict mode, validates all inputs against the standards. See id3.org
          // ID3v2 Options
          id3v2: { padding: 4096 }
        });

        // There should be an error since newlines are not allowed in title
        if (mp3tag.error !== '') {
          mp3Files.value[i].status = STATUS_ERROR;
          mp3Files.value[i].message = mp3tag.error;
          report.error += 1;
        } else {

          try {
            const savePath = saveOriginalFile.value ? mp3FilePath.replace('.mp3', '_TAGGED.mp3') : mp3FilePath;
            await writeBinaryFile(savePath, new Uint8Array(arrayBuffer));
            mp3Files.value[i].status = STATUS_SUCCESS;
            report.success += 1;
          }  catch (error) {
            try {
              const savePath = mp3FilePath.replace('.mp3', '_TAGGED.mp3');
              await writeBinaryFile(savePath, new Uint8Array(arrayBuffer));
              mp3Files.value[i].status = STATUS_SUCCESS;
              mp3Files.value[i].message = '** This file was saved with the "_TAGGED" suffix because access was denied to it.';
              report.success += 1;
            }  catch (error2) {
              console.error(error2);
              mp3Files.value[i].status = STATUS_ERROR;
              mp3Files.value[i].message = error2;
              report.error += 1;
            }
          }
        }
      }
    }
  }
  loaderIsVisible.value = false;
  reportData.value =  { ...report };
}

async function selectXlsFile() {
  let defaultPath = window.localStorage.getItem('defaultPathXls');
  if (!defaultPath) {
    defaultPath = await documentDir();
  }

  /* show open file dialog */
  selectedExcelFile.value = await open({
    title: 'Select Spreadsheet',
    multiple: false,
    directory: false,
    filters: xlsTypeFilters,
    defaultPath
  });

  if (selectedExcelFile.value) {
    window.localStorage.setItem('defaultPathXls', selectedExcelFile.value);
    loaderIsVisible.value = true;
    animateLoader(0, 80, 'Reading xls file...', 10);
    /* read data into a Uint8Array */
    const d = await readBinaryFile(selectedExcelFile.value);
    animateLoader(80, 98, 'Parsing xls file...', 100);
    /* parse with SheetJS */
    const wb = await read(d);
    /* get the first worksheet */
    const ws = wb.Sheets[wb.SheetNames[0]];
    /* get data from the first worksheet */
    excelData.value = utils.sheet_to_json(ws, { header: 1 });
    loaderIsVisible.value = false;

    await beginAutoPair();
  }
}

function setLoaderWidth(width, text = '') {
  const loader = document.querySelector('.loader-grey');
  if (loader && loader.style) {
    loader.style.width = width + '%';
  }
  document.querySelector('.loader-text').innerHTML = text;
}

function animateLoader(from = 0, to = 100, text = '', tout = 10) {
  let width = from;
  const id = setInterval(frame, tout);
  function frame() {
    if (width >= to) {
      clearInterval(id);
    } else {
      width++;
      setLoaderWidth(width, text);
    }
  }
}

async function selectFolder() {
  let defaultPath = window.localStorage.getItem('defaultPath');
  if (!defaultPath) {
    defaultPath = await audioDir();
  }
  const selected = await open({
    directory: true,
    multiple: true,
    defaultPath,
  });
  if (Array.isArray(selected)) {
    selectedMp3Folder.value = selected;
  } else if (selected === null) {
    selectedMp3Folder.value = [];
  } else {
    selectedMp3Folder.value = [selected];
  }

  async function processFolder(folder) {
    loaderIsVisible.value = true;
    animateLoader(0, 80, 'Scan folders...');
    const entries = await readDir(folder, { recursive: true });
    animateLoader(80, 100, 'Scan folders...');
    loaderIsVisible.value = false;
    function processEntries(entries) {
      for (const entry of entries) {
        if (entry.children) {
          processEntries(entry.children);
        }else if (entry.path.endsWith('.mp3')) {
          mp3Files.value.push({
            path: entry.path,
            status: STATUS_WAITING,
            message: '',
            excelRow: null,
            checked: true,
          });
        }
      }
    }
    processEntries(entries);
  }
  for (const folder of selectedMp3Folder.value) {
    await processFolder(folder);
    window.localStorage.setItem('defaultPath', folder);
  }
}

async function selectMp3Files() {
  let defaultPath = window.localStorage.getItem('defaultPathMp3');
  if (!defaultPath) {
    defaultPath = await audioDir();
  }
  /* show open file dialog */
  const selectedMp3Files = await open({
    title: 'Select MP3 files',
    multiple: true,
    directory: false,
    filters: mp3TypeFilters,
    defaultPath,
  });

  if (selectedMp3Files && Array.isArray(selectedMp3Files) && selectedMp3Files.length) {
    loaderIsVisible.value = true;
    setLoaderWidth(0);
    for (let i = 0; i < selectedMp3Files.length; i += 1) {
      window.localStorage.setItem('defaultPathMp3', selectedMp3Files[i]);
      setLoaderWidth(100 * i / selectedMp3Files.length, 'Scan mp3 files...');
      if (selectedMp3Files[i].endsWith('.mp3')) {
        mp3Files.value.push({
          path: selectedMp3Files[i],
          status: STATUS_WAITING,
          message: '',
          excelRow: null,
          checked: true,
        });
      }
    }
    loaderIsVisible.value = false;
  }
}

function getFileNameFromFilePath(filePath) {
  let DS = '/';
  if (platformName.value === 'win32') {
    DS = '\\';
  }
  return filePath.split(DS).pop();
}

function selectXlsFileIndexForMp3(excelRowNr) {
  if (mp3Files.value[selectedMp3FileIndex.value].excelRow === excelRowNr) {
    mp3Files.value[selectedMp3FileIndex.value].excelRow = null;
  } else {
    mp3Files.value[selectedMp3FileIndex.value].excelRow = excelRowNr;
    selectedMp3FileIndex.value = null;
  }
}

function clearAll() {
  excelData.value = [];
  selectedExcelFile.value = null;
  selectedMp3Folder.value = null;
  selectedMp3FileIndex.value = null;
  loaderIsVisible.value = false;
  mp3Files.value = [];
  window.location.reload();
}

async function testFunction() {
  let defaultPath = window.localStorage.getItem('defaultPathMp3');
  if (!defaultPath) {
    defaultPath = await audioDir();
  }
  /* show open file dialog */
  const selectedMp3Files = await open({
    title: 'Select MP3 file',
    multiple: false,
    directory: false,
    filters: mp3TypeFilters,
    defaultPath,
  });

  testText.value = '';
  if (selectedMp3Files) {
    testText.value += selectedMp3Files + '<br>';
    testText.value += `Please wait...<br>`;
    const uint8Array = await readBinaryFile(selectedMp3Files);
    const mp3tag = new MP3Tag(typedArrayToBuffer(uint8Array), false);
    mp3tag.read({
      id3v1: false
    });
    if (mp3tag.error !== '') {
      testText.value += `Error reading tags: ${mp3tag.error}<br>`;
    } else {
      testText.value += `Reading TAGS: OK<br>`;
      if (mp3tag.error !== '') {
        testText.value += `Error saving tags: ${mp3tag.error}<br>`;
      }
      testText.value += `Please wait...<br>`;
      mp3tag.read();
      if (mp3tag.tags && mp3tag.tags.v2 && mp3tag.tags.v2.APIC && mp3tag.tags.v2.APIC[0]) {
        mp3tag.tags.v2.APIC[0].data = ["..."];
      }
      testText.value += `TAGS: <pre style="text-align: left;background: white;">${JSON.stringify(mp3tag.tags.v2, null, 2)}</pre><br>`;
    }
  }
}

watch(checkAllMp3, async (newValue) => {
  for (let i = 0; i < mp3Files.value.length; i += 1) {
    mp3Files.value[i].checked = newValue;
  }
});

onMounted(async () => {
  platformName.value = await platform();
});
</script>

<template>
  <div style="display: flex; flex-direction: column;">
    <div class="top-buttons">
      <div class="top-buttons__button-wrapper" :style="`${settingsIsVisible ? 'background: white;' : ''}`">
        <img src="../assets/icons/settings.svg"
             v-if="!settingsIsVisible"
             @click="settingsIsVisible = !settingsIsVisible"
             style="height: 25px;cursor: pointer;"
             alt=""/>
        <img src="../assets/icons/close.svg"
             v-else
             @click="settingsIsVisible = !settingsIsVisible"
             style="height: 25px;cursor: pointer;"
             alt=""/>
      </div>
      <div class="top-buttons__button-wrapper">
        <button @click="selectFolder">Select folders with mp3 files</button>
      </div>
      <div class="top-buttons__button-wrapper">or</div>
      <div class="top-buttons__button-wrapper">
        <button @click="selectMp3Files">Select mp3 files</button>
      </div>
      <div class="top-buttons__button-wrapper">
        <button :disabled="!mp3Files.length" @click="selectXlsFile">Select xls file</button>
      </div>
      <div class="top-buttons__button-wrapper">
        <button :disabled="!mp3FilesHavePairs || loaderIsVisible"
                class="mp3-buttons__button_positive"
                @click="changeMp3Tags">Start</button>
      </div>
      <div class="top-buttons__button-wrapper">
        <button :disabled="!mp3Files.length" @click="clearAll">Clear All</button>
      </div>
      <div class="top-buttons__button-wrapper">
        <button @click="testFunction">View Tags</button>
      </div>
    </div>

    <div v-if="settingsIsVisible" class="settings">
      <div style="color: #919191;font-size: 12px;">
        * The first row of the XLS file must serve as the header;
        It will not be parsed for pairing with songs.
      </div>
      <table>
        <tr>
          <td colspan="2" style="color: #919191;">
            Please fill in the column numbers from the XLS file.
            <br>
            Column numbers start from 1.
          </td>
        </tr>
        <tr>
          <td>Artist:</td> <td><input v-model="xlsArtistColNr" type="number"></td>
        </tr>
        <tr>
          <td>Title:</td> <td><input v-model="xlsTitleColNr" type="number"></td>
        </tr>
        <tr>
          <td>Album:</td> <td><input v-model="xlsAlbumColNr" type="number"></td>
        </tr>
      </table>
      <div style="color: #3b3b3b;font-size: 13px;margin-top: 15px;">
        <label>
          <input type="checkbox" v-model="saveOriginalFile"/>
          Save the original file; the tagged file will be saved with the "_TAGGED" suffix
        </label>
      </div>
    </div>

    <div class="loader-border" :class="loaderIsVisible ? '' : 'hidden'">
      <div class="loader-grey" style="height:4px;width:1%"></div>
    </div>
    <div class="loader-text" :class="loaderIsVisible ? '' : 'hidden'">
      Loading...
    </div>

    <div class="report" style="font-size: 13px;">
      <div v-if="testText" style="text-align: left;">
        <img src="../assets/icons/close.svg" style="height: 20px;cursor: pointer" @click="testText = ''"  alt="Close"/>
      </div>
      <div v-if="testText" style="text-align: left;" v-html="testText"></div>
      <div v-if="reportData.success" class="text-green">Success: {{reportData.success}}</div>
      <div v-if="reportData.error" class="text-red">Error: {{reportData.error}}</div>
      <div v-if="reportData.unchecked" class="text-black">Unchecked: {{reportData.unchecked}}</div>
      <div v-if="reportData.notPaired" class="text-red">Not paired: {{reportData.notPaired}}</div>
    </div>

    <div class="mp3-rows" v-if="mp3Files.length">
      <div class="mp3-row mp3-row_header">
        <div class="mp3-nr">#</div>
        <div class="mp3-checkbox">
          <input type="checkbox" v-model="checkAllMp3" />
        </div>
        <div v-if="excelData.length" class="mp3-buttons"></div>
        <div>File name</div>
      </div>
      <template v-for="(mp3FileData, mp3FileIndex) in mp3Files">
        <div class="mp3-row">
          <div class="mp3-nr">{{(mp3FileIndex + 1)}}</div>
          <div class="mp3-checkbox">
            <input type="checkbox" v-model="mp3Files[mp3FileIndex].checked" />
          </div>
          <div v-if="excelData.length && mp3Files[mp3FileIndex].excelRow !== null" class="mp3-buttons">
            <button :class="`mp3-buttons__button mp3-buttons__button_${mp3Files[mp3FileIndex].excelRow ? 'positive' : 'negative'}`"
                    @click="selectedMp3FileIndex = mp3FileIndex"
                    >{{(mp3Files[mp3FileIndex].excelRow ? `xls row: ${mp3Files[mp3FileIndex].excelRow}` : 'not found')}}</button>
          </div>
          <div>
            <div style="display: flex; align-items: center;">
              <img src="../assets/icons/info.svg"
                   v-if="mp3Files[mp3FileIndex].title || mp3Files[mp3FileIndex].album || mp3Files[mp3FileIndex].artist"
                   @click="mp3Files[mp3FileIndex].info = !mp3Files[mp3FileIndex].info"
                   style="height: 16px; cursor: pointer; margin: 0 10px 2px 0;"
                   alt="View Info"/>
              {{getFileNameFromFilePath(mp3FileData.path)}}
            </div>
            <div v-if="mp3Files[mp3FileIndex].info" class="mp3-result" style="line-height: 1.1;">
              <div v-if="mp3Files[mp3FileIndex].title">Title: {{mp3Files[mp3FileIndex].title}}</div>
              <div v-if="mp3Files[mp3FileIndex].album">Album: {{mp3Files[mp3FileIndex].album}}</div>
              <div v-if="mp3Files[mp3FileIndex].artist">Artis: {{mp3Files[mp3FileIndex].artist}}</div>
            </div>
            <div :class="`mp3-result mp3-result_${mp3FileData.status}`">
              {{mp3FileData.status}} {{mp3FileData.message}}
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="selectedMp3FileIndex !== null" class="modal">
      <div class="modal-content">
        <span @click="selectedMp3FileIndex = null" class="modal-close">&times;</span>
        <div>
          <table class="table table_bordered">
            <thead>
              <tr>
                <th></th>
                <th></th>
                <template v-if="excelData[0]" v-for="(tdName, tdIndex) in excelData[0]">
                  <th v-if="tdIndex <= 2">{{tdName}}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <template v-for="(excelRowData, excelRowNr) in excelData">
                <tr v-if="excelRowNr > 0">
                  <td>
                    <input type="checkbox"
                           @change="selectXlsFileIndexForMp3(excelRowNr)"
                           :checked="mp3Files[selectedMp3FileIndex].excelRow === excelRowNr" />
                  </td>
                  <td>
                    {{excelRowNr}}
                  </td>
                  <template v-for="(tdName, tdIndex) in excelRowData">
                    <td v-if="tdIndex <= 2">{{tdName}}</td>
                  </template>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </div>
</template>
