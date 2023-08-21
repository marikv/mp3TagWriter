<script setup>
import { open } from '@tauri-apps/api/dialog';
import { appDataDir } from '@tauri-apps/api/path';
import { platform } from '@tauri-apps/api/os';
import { readBinaryFile, readDir } from '@tauri-apps/api/fs';
import { computed, onMounted, ref, shallowRef } from 'vue';
import { read, utils } from 'XLSX';
import MP3Tag from 'mp3tag.js';
import Helpers from '../classes/Helpers.js';
import {
  mp3TypeFilters,
  xlsTypeFilters,
  STATUS_WAITING,
  STATUS_PROCESSING,
  STATUS_ERROR,
  STATUS_DONE,
} from '../enums/mp3Tags.js';

const selectedExcelFile = ref('');
const selectedMp3Folder = ref([]);
const xlsData = shallowRef([]);
const platformName = ref(null);
const mp3Files = ref([]);
const loaderIsVisible = ref(false);
const pairWindowIsOpened = ref(false);
const mp3FileIndexSelected = ref(0);

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

async function beginAutoPair() {
  if (xlsData.value.length && mp3Files.value.length) {
    setLoaderWidth(0, '');
    loaderIsVisible.value = true;
    for (let i = 0; i < mp3Files.value.length; i += 1) {
      const loaderWith = 100 * i / mp3Files.value.length;
      setLoaderWidth(loaderWith, loaderWith.toFixed(2) + '%<br>Reading MP3 tags and searching for the corresponding row in the XLS file:<br>' + getFileNameFromFilePath(mp3Files.value[i].path));
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

        for (let j = 0; j < xlsData.value.length; j += 1) {
          if (j > 0) {
            const xlsArtis = xlsData.value[j][0];
            const xlsTitle = xlsData.value[j][1];
            const xlsAlbum = xlsData.value[j][2];
            // console.log(xlsArtis, xlsTitle, xlsAlbum);
            if (
                Helpers.strEqual(xlsArtis, mp3tag.tags.artist)
                && Helpers.strEqual(xlsTitle, mp3tag.tags.title)
                && Helpers.strEqual(xlsAlbum, mp3tag.tags.album)
            ) {
              mp3Files.value[i].excelRow = j;
            }
          }
        }
      }
    }
    loaderIsVisible.value = false;
  }
}

async function changeMp3Tags() {
  loaderIsVisible.value = true;

  for (let i = 0; i < mp3Files.value.length; i++) {
    mp3Files.value[i].status = STATUS_PROCESSING;
    const mp3FileName = mp3Files.value[i].path;
    let loaderPercentage = 100 * i / mp3Files.value.length;

    if (loaderPercentage > 100) {
      loaderPercentage = 100;
    } else if (loaderPercentage === 0) {
      loaderPercentage = 3;
    }

    setLoaderWidth(loaderPercentage);

    /* read data into a Uint8Array */
    const uint8Array = await readBinaryFile(mp3FileName);
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
      console.log('mp3tag.tags', mp3tag.tags);
      mp3tag.tags.v2.EPVEPOQUE = '2010-2015';
      mp3tag.tags.v2.EPVGENRE = 'Electro';
      mp3tag.tags.v2.EPVPAYS = 'International';
      mp3tag.tags.v2.EPVTEMPO = 'Medium';

      mp3tag.save({
        strict: true, // Strict mode, validates all inputs against the standards. See id3.org
        // ID3v2 Options
        id3v2: { padding: 4096 }
      });

      mp3Files.value[i].status = STATUS_DONE;
    }
  }
  loaderIsVisible.value = false;
}

async function selectXlsFile() {
  /* show open file dialog */
  selectedExcelFile.value = await open({
    title: 'Select Spreadsheet',
    multiple: false,
    directory: false,
    filters: xlsTypeFilters,
  });

  if (selectedExcelFile.value) {
    loaderIsVisible.value = true;
    animateLoader(0, 80, 'Reading xls file...');
    /* read data into a Uint8Array */
    const d = await readBinaryFile(selectedExcelFile.value);
    animateLoader(80, 90, 'Reading binary xls file...');
    /* parse with SheetJS */
    const wb = await read(d);
    animateLoader(90, 100, 'Parsing xls file...');
    /* get the first worksheet */
    const ws = wb.Sheets[wb.SheetNames[0]];
    /* get data from the first worksheet */
    xlsData.value = utils.sheet_to_json(ws, { header: 1 });
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

function animateLoader(from = 0, to = 100, text = '') {
  let width = from;
  const id = setInterval(frame, 10);
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
  const selected = await open({
    directory: true,
    multiple: true,
    defaultPath: await appDataDir(),
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
  }
}

async function selectMp3Files() {
  /* show open file dialog */
  const selectedMp3Files = await open({
    title: 'Select MP3 files',
    multiple: true,
    directory: false,
    filters: mp3TypeFilters,
  });

  if (selectedMp3Files && Array.isArray(selectedMp3Files) && selectedMp3Files.length) {
    loaderIsVisible.value = true;
    setLoaderWidth(0);
    for (let i = 0; i < selectedMp3Files.length; i += 1) {
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
  if (platformName.value === 'win32') {
    return filePath.split('\\').pop();
  }
  return filePath.split('/').pop();
}

function openPairedXls(mp3FileIndex) {
  pairWindowIsOpened.value = true;
  mp3FileIndexSelected.value = mp3Files.value[mp3FileIndex].excelRow;
}

function selectXlsFileIndexForMp3(xlsIndex) {
  if (mp3Files.value[mp3FileIndexSelected.value].excelRow === xlsIndex) {
    mp3Files.value[mp3FileIndexSelected.value].excelRow = null;
  } else {
    mp3Files.value[mp3FileIndexSelected.value].excelRow = xlsIndex;
  }
  mp3FileIndexSelected.value = 0;
  pairWindowIsOpened.value = false;
}

function clearAll() {
  xlsData.value = [];
  selectedExcelFile.value = null;
  selectedMp3Folder.value = null;
  mp3FileIndexSelected.value = 0;
  loaderIsVisible.value = false;
  mp3Files.value = [];
  window.location.reload();
}

onMounted(async () => {
  platformName.value = await platform();
});
</script>

<template>
  <div style="display: flex; flex-direction: column;">
    <div style="display: flex;align-items: center;font-size: 13px;margin: auto auto 10px;">
      <div style="padding: 6px;">
        <button @click="selectFolder">Select folders with mp3 files</button>
      </div>
      <div>or</div>
      <div style="padding: 6px;">
        <button @click="selectMp3Files">Select mp3 files</button>
      </div>
      <div style="padding: 6px;">
        <button :disabled="!mp3Files.length" @click="selectXlsFile">Select xls file</button>
      </div>
      <div style="padding: 6px;">
        <button :disabled="!mp3FilesHavePairs" @click="changeMp3Tags">Start</button>
      </div>
      <div style="padding: 6px;">
        <button :disabled="!mp3Files.length" @click="clearAll">Clear All</button>
      </div>
    </div>

    <div class="loader-border" :class="loaderIsVisible ? '' : 'hidden'">
      <div class="loader-grey" style="height:4px;width:1%"></div>
    </div>
    <div class="loader-text" :class="loaderIsVisible ? '' : 'hidden'">
      Loading...
    </div>

    <div style="text-align: left;font-size: 0.9em;padding-top: 30px;" v-if="mp3Files.length">
      <template v-for="(mp3FileData, mp3FileIndex) in mp3Files">
        <div style="display: flex; flex-wrap: nowrap; align-items: center; border-bottom: 1px solid white;padding: 4px 2px;">
          <div class="mp3-nr">{{(mp3FileIndex + 1)}}</div>
          <div class="mp3-checkbox">
            <input type="checkbox" v-model="mp3Files[mp3FileIndex].checked" />
          </div>
          <div v-if="xlsData.length" class="mp3-buttons">
            <button :class="`mp3-buttons__button mp3-buttons__button_${mp3Files[mp3FileIndex].excelRow ? 'positive' : 'negative'}`"
                    @click="openPairedXls(mp3FileIndex)"
                    >{{mp3Files[mp3FileIndex].excelRow ? `xls row: ${mp3Files[mp3FileIndex].excelRow}` : 'not found'}}</button>
          </div>
          <div>
            {{getFileNameFromFilePath(mp3FileData.path)}}
            <span class="mp3-result" :class="`mp3-result-${mp3FileData.status}`">
              {{mp3FileData.status}} {{mp3FileData.message}}
            </span>
          </div>
        </div>
      </template>
    </div>

    <div v-if="pairWindowIsOpened" class="modal">
      <div class="modal-content">
        <span @click="pairWindowIsOpened = false" class="modal-close">&times;</span>
        <div>
          <table class="table table_bordered">
            <thead>
              <tr>
                <th></th>
                <th></th>
                <template v-if="xlsData[0]" v-for="(tdName, tdIndex) in xlsData[0]">
                  <th v-if="tdIndex <= 2">{{tdName}}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <template v-for="(xlsItem, xlsIndex) in xlsData">
                <tr v-if="xlsIndex > 0">
                  <td>
                    <input type="checkbox"
                           @click="selectXlsFileIndexForMp3(xlsIndex)"
                           :checked="mp3FileIndexSelected === xlsIndex" />
                  </td>
                  <td>
                    {{xlsIndex}}
                  </td>
                  <template v-for="(tdName, tdIndex) in xlsItem">
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
