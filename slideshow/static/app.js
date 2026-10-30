// app.js — Slideshow viewer
// Responsibilities: fetch image list, display images, handle slideshow
// controls (pause, resume, next, prev, menu).
// N opens a notes form to annotate images; data saved to the notes table.
// E opens the provenance form (create/edit/delete the prov row for the image).
// G jumps to an image number; T sets display time for this run; P opens the
// params page.

(function app() {
  // DOM elements
  var currentImage = document.getElementById('current-image');
  var preloadImage = document.getElementById('preload-image');
  var loadingEl = document.getElementById('loading');
  var pauseIndicator = document.getElementById('pause-indicator');
  var menuOverlay = document.getElementById('menu-overlay');
  var imageCounter = document.getElementById('image-counter');
  var actionIndicator = document.getElementById('action-indicator');
  var infoOverlay = document.getElementById('info-overlay');

  // Notes form elements
  var notesOverlay = document.getElementById('notes-overlay');
  var notesPanelEl = notesOverlay.querySelector('.panel');
  var notesDragHandle = notesOverlay.querySelector('h2');
  var notesImgSize = document.getElementById('notes-img-size');
  var notesFilename = document.getElementById('notes-filename');
  var notesImgId = document.getElementById('notes-img-id');
  var notesCamera = document.getElementById('notes-camera');
  var notesPath = document.getElementById('notes-path');
  var notesDateTaken = document.getElementById('notes-date-taken');
  var notesDateCreated = document.getElementById('notes-date-created');
  var notesKb = document.getElementById('notes-kb');
  var notesCategory = document.getElementById('notes-category');
  var notesRank = document.getElementById('notes-rank');
  var notesComment = document.getElementById('notes-comment');
  var notesMsg = document.getElementById('notes-msg');
  var notesCancelBtn = document.getElementById('notes-cancel-btn');
  var notesSubmitBtn = document.getElementById('notes-submit-btn');

  // Provenance form elements
  var provOverlay = document.getElementById('prov-overlay');
  var provFilename = document.getElementById('prov-filename');
  var provImgId = document.getElementById('prov-img-id');
  var provDateTaken = document.getElementById('prov-date-taken');
  var provMsg = document.getElementById('prov-msg');
  var provDeleteBtn = document.getElementById('prov-delete-btn');
  var provInputs = {
    title: document.getElementById('prov-title'),
    subtitle: document.getElementById('prov-subtitle'),
    place: document.getElementById('prov-place'),
    event_time: document.getElementById('prov-event-time'),
    subjects: document.getElementById('prov-subjects'),
    source: document.getElementById('prov-source'),
    shooter: document.getElementById('prov-shooter'),
    photo_rank: document.getElementById('prov-photo-rank'),
    event_rank: document.getElementById('prov-event-rank'),
    comment: document.getElementById('prov-comment'),
  };

  // Parse URL params
  var urlParams = new URLSearchParams(window.location.search);

  // State
  var images = [];
  var currentIndex = parseInt(urlParams.get('index')) || 0;
  var displayTimeMs = parseInt(urlParams.get('displayTimeMs')) || 5000;
  var isPaused = false;
  var isMenuOpen = false;
  var currentForm = null; // 'notes', 'prov' or null
  var provExists = false; // does the open prov form have a saved row?
  var hasImageError = false;
  var isErrorState = false; // true on startup error; Escape → Params page
  var timer = null;
  var currentFotoId = null;
  var currentFilename = '';
  var currentPath = '';
  var currentDtTaken = '';
  var currentDtCreated = '';
  var currentBytes = null;
  var currentImgSize = '';
  var currentCamera = '';
  var currentMd5 = '';
  var currentDuration = '';
  var isInfoVisible = false;

  // Params page URL; carries this run's display time and image index
  function paramsUrl() {
    return '/params?displayTimeMs=' + displayTimeMs + '&index=' + currentIndex;
  }

  // Show a brief toast for action feedback
  function showActionToast(message) {
    if (!actionIndicator) return;
    actionIndicator.textContent = message;
    actionIndicator.classList.add('visible');
    setTimeout(function () {
      actionIndicator.classList.remove('visible');
    }, 1500);
  }

  // Fetch image list from server
  async function fetchImages() {
    var response = await fetch('/api/images');
    return await response.json();
  }

  function resetCurrentInfo() {
    currentFotoId = null;
    currentFilename = '';
    currentPath = '';
    currentDtTaken = '';
    currentDtCreated = '';
    currentBytes = null;
    currentImgSize = '';
    currentCamera = '';
    currentMd5 = '';
    currentDuration = '';
    updateInfoOverlay();
  }

  // Fetch the foto_id, name, path, dtCreated, and missing-on-disk status for
  // the current image index. Returns the parsed response (or null on
  // failure) so callers can check `missing` before loading the image itself
  // — see docs/reconcile.md.
  async function fetchImageInfo(index) {
    if (index < 0 || index >= images.length) return null;
    try {
      var response = await fetch('/api/imageInfo/' + index);
      if (!response.ok) {
        resetCurrentInfo();
        return null;
      }
      var data = await response.json();
      currentFotoId = data.id;
      currentFilename = data.name || '';
      currentPath = data.path || '';
      currentDtTaken = data.dtTaken || '';
      currentDtCreated = data.dtCreated || '';
      currentBytes = typeof data.bytes === 'number' ? data.bytes : null;
      currentImgSize = data.imgSize || '';
      currentCamera = data.camera || '';
      currentMd5 = data.md5 || '';
      currentDuration = data.duration || '';
      updateInfoOverlay();
      return data;
    } catch {
      resetCurrentInfo();
      return null;
    }
  }

  // Toggleable overlay showing ID/filename/path/dates/size for the current image
  function updateInfoOverlay() {
    if (!isInfoVisible) return;
    var kb = currentBytes !== null ? Math.round(currentBytes / 1024) + ' KB' : 'Unknown';
    infoOverlay.textContent =
      'img_id: ' + (currentFotoId !== null ? currentFotoId : 'Unknown') +
        '   md5: ' + (currentMd5 || 'Unknown') + '\n' +
      'Name: ' + (currentFilename || 'Unknown') + '\n' +
      'Camera: ' + (currentCamera || 'Unknown') + '\n' +
      'Path: ' + (currentPath || 'Unknown') + '\n' +
      'Taken: ' + (currentDtTaken || 'Unknown') + '  Created: ' + (currentDtCreated || 'Unknown') + '\n' +
      kb + (currentImgSize ? '  ' + currentImgSize : '') +
        (currentDuration ? '  ' + currentDuration : '');
  }

  function toggleInfo() {
    isInfoVisible = !isInfoVisible;
    infoOverlay.classList.toggle('visible', isInfoVisible);
    updateInfoOverlay();
  }

  // Notes form
  function openNotesForm() {
    pause();
    closeMenu();
    currentForm = 'notes';
    notesFilename.textContent = currentFilename || 'Unknown';
    notesImgId.textContent = currentFotoId !== null ? currentFotoId : 'Unknown';
    notesCamera.textContent = currentCamera || 'Unknown';
    notesPath.textContent = currentPath || 'Unknown';
    notesDateTaken.textContent = currentDtTaken || 'Unknown';
    notesDateCreated.textContent = currentDtCreated || 'Unknown';
    notesKb.textContent = currentBytes !== null ? String(Math.round(currentBytes / 1024)) : '';
    notesImgSize.textContent = currentImgSize || '';
    notesCategory.value = '';
    notesRank.value = '';
    notesComment.value = '';
    notesMsg.textContent = '';
    notesMsg.className = 'action-status';
    notesOverlay.classList.add('visible');
    setTimeout(function () {
      notesCategory.focus();
    }, 0);
  }

  function closeNotesForm() {
    currentForm = null;
    notesOverlay.classList.remove('visible');
    // Leave notesPanelEl's transform/panelOffsetX/Y as-is so the panel reopens
    // wherever the user last dragged it to, for the rest of the session.
  }

  async function submitNote() {
    if (currentFotoId === null) {
      notesMsg.textContent = 'No image selected';
      notesMsg.className = 'action-status error';
      return;
    }
    if (notesCategory.value.trim() === '') {
      notesMsg.textContent = 'Category is required';
      notesMsg.className = 'action-status error';
      notesCategory.focus();
      return;
    }
    try {
      var rankVal = notesRank.value !== '' ? parseInt(notesRank.value) : null;
      var response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fotoId: currentFotoId,
          category: notesCategory.value.trim(),
          rank: rankVal,
          comment: notesComment.value.trim(),
        }),
      });
      if (response.ok) {
        notesMsg.textContent = 'Note saved';
        notesMsg.className = 'action-status success';
        showActionToast('Note saved');
        setTimeout(closeNotesForm, 800);
      } else {
        var errData = await response.json();
        notesMsg.textContent = errData.error || 'Failed to save';
        notesMsg.className = 'action-status error';
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      var prefix = error instanceof TypeError
        ? "Can't reach the server — is it still running? "
        : 'Error saving note: ';
      notesMsg.textContent = prefix + error;
      notesMsg.className = 'action-status error';
    }
  }

  // Provenance form: create/edit/delete the prov row for the current image.
  function setProvMsg(text, kind) {
    provMsg.textContent = text;
    provMsg.className = 'action-status' + (kind ? ' ' + kind : '');
  }

  async function openProvForm() {
    if (currentFotoId === null) {
      showActionToast('No image selected');
      return;
    }
    var fotoId = currentFotoId;
    pause();
    closeMenu();
    currentForm = 'prov';
    provFilename.textContent = currentFilename || 'Unknown';
    provImgId.textContent = fotoId;
    provDateTaken.textContent = currentDtTaken || 'Unknown';
    Object.keys(provInputs).forEach(function (k) { provInputs[k].value = ''; });
    provExists = false;
    provDeleteBtn.disabled = true;
    setProvMsg('');
    provOverlay.classList.add('visible');
    try {
      var response = await fetch('/api/prov/' + fotoId);
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load');
      if (data.prov) {
        provExists = true;
        provDeleteBtn.disabled = false;
        Object.keys(provInputs).forEach(function (k) {
          var v = data.prov[k];
          provInputs[k].value = v === null || v === undefined ? '' : v;
        });
      }
    } catch (error) {
      console.error('Failed to load prov:', error);
      setProvMsg('Could not load saved values: ' + error.message, 'error');
    }
    provInputs.title.focus();
  }

  function closeProvForm() {
    currentForm = null;
    provOverlay.classList.remove('visible');
  }

  async function submitProv() {
    var body = {};
    Object.keys(provInputs).forEach(function (k) {
      var v = provInputs[k].value;
      if (k === 'photo_rank' || k === 'event_rank') {
        body[k] = v.trim() === '' ? null : Number(v);
      } else {
        body[k] = v;
      }
    });
    try {
      var response = await fetch('/api/prov/' + currentFotoId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await response.json();
      if (!response.ok) {
        setProvMsg(data.error || 'Failed to save', 'error');
        return;
      }
      closeProvForm();
      showActionToast(data.result === 'deleted' ? 'Prov cleared' : 'Prov saved');
    } catch (error) {
      console.error('Failed to save prov:', error);
      var prefix = error instanceof TypeError
        ? "Can't reach the server — is it still running? "
        : 'Error saving prov: ';
      setProvMsg(prefix + error, 'error');
    }
  }

  async function deleteProvRow() {
    if (!provExists) return;
    if (!window.confirm('Delete the provenance record for img_id ' + currentFotoId + '?')) return;
    try {
      var response = await fetch('/api/prov/' + currentFotoId, { method: 'DELETE' });
      if (!response.ok) {
        var data = await response.json();
        setProvMsg(data.error || 'Failed to delete', 'error');
        return;
      }
      closeProvForm();
      showActionToast('Prov deleted');
    } catch (error) {
      console.error('Failed to delete prov:', error);
      setProvMsg('Error deleting prov: ' + error, 'error');
    }
  }

  document.getElementById('prov-cancel-btn').addEventListener('click', closeProvForm);
  document.getElementById('prov-submit-btn').addEventListener('click', submitProv);
  provDeleteBtn.addEventListener('click', deleteProvRow);

  // Notes form button handlers
  notesCancelBtn.addEventListener('click', function () {
    closeNotesForm();
  });

  notesSubmitBtn.addEventListener('click', function () {
    submitNote();
  });

  // Form panel drag (translate from centered position). Each panel keeps its
  // own offset, so it reopens wherever it was last dragged to.
  function makeDraggable(panel, handle) {
    var isDragging = false;
    var startX, startY;
    var offsetX = 0, offsetY = 0;

    handle.addEventListener('mousedown', function (e) {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = offsetX + e.clientX - startX;
      var dy = offsetY + e.clientY - startY;
      panel.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
    });

    document.addEventListener('mouseup', function (e) {
      if (!isDragging) return;
      offsetX += e.clientX - startX;
      offsetY += e.clientY - startY;
      isDragging = false;
    });
  }

  makeDraggable(notesPanelEl, notesDragHandle);
  makeDraggable(provOverlay.querySelector('.panel'), provOverlay.querySelector('h2'));

  // Display an image by index. In DB mode, checks missing-on-disk status
  // (via fetchImageInfo) before loading the file — a known-missing image is
  // shown as a brief message and skipped, rather than attempted and left to
  // fail as a broken <img> load. See docs/reconcile.md.
  async function showImage(index) {
    if (images.length === 0) return;
    if (index < 0 || index >= images.length) {
      index = 0;
    }
    currentIndex = index;

    var info = await fetchImageInfo(index);
    if (info && info.missing) {
      showMissingImage(info);
      return;
    }
    // Videos (.avi, .mp4, ...) and raw/editor formats live in `fotos` too.
    // Handle them like missing files — show the identifying details and move
    // on — rather than letting the <img> load fail into the error state,
    // which pauses the slideshow and swallows the I/N keys.
    if (info && info.displayable === false) {
      showUndisplayable(info);
      return;
    }

    loadingEl.style.display = 'none';
    currentImage.style.display = 'block';
    currentImage.src = '/images/' + images[index];

    imageCounter.textContent = (index + 1) + ' / ' + images.length;

    var nextIndex = (index + 1) % images.length;
    preloadImage.src = '/images/' + images[nextIndex];

    scheduleNext();
  }

  // Show a brief "photo missing" message for the normal display duration,
  // then advance — reuses scheduleNext(), which schedules off currentIndex
  // (already set to this missing image's index by showImage above).
  function showMissingImage(info) {
    currentImage.style.display = 'none';
    loadingEl.style.display = 'block';
    imageCounter.textContent = (currentIndex + 1) + ' / ' + images.length;
    var detail = [];
    if (info.id !== null && info.id !== undefined) detail.push('IMG_ID ' + info.id);
    if (info.path) detail.push(info.path);
    showError('Photo missing — skipped', detail.join('<br>'));
    scheduleNext();
  }

  // Show what we know about a file the browser can't render, for displayTimeMs,
  // then advance. Mirrors showMissingImage: currentIndex is already this image,
  // so scheduleNext() moves on normally and I/N still work (no error state).
  function showUndisplayable(info) {
    currentImage.style.display = 'none';
    loadingEl.style.display = 'block';
    imageCounter.textContent = (currentIndex + 1) + ' / ' + images.length;
    var detail = [];
    if (info.id !== null && info.id !== undefined) detail.push('img_id: ' + info.id);
    if (info.name) detail.push(info.name);
    if (info.path) detail.push(info.path);
    var extra = [];
    if (info.imgSize) extra.push(info.imgSize);
    if (info.duration) extra.push(info.duration);
    if (extra.length) detail.push(extra.join('  '));
    showError("Can't display this file — skipped", detail.join('<br>'));
    scheduleNext();
  }

  function scheduleNext() {
    clearTimeout(timer);
    if (!isPaused && !isMenuOpen && !currentForm) {
      timer = setTimeout(function () {
        var nextIndex = (currentIndex + 1) % images.length;
        showImage(nextIndex);
      }, displayTimeMs);
    }
  }

  function prevImage() {
    showImage((currentIndex - 1 + images.length) % images.length);
  }

  function nextImage() {
    showImage((currentIndex + 1) % images.length);
  }

  // Ask for an image number (as shown in the counter, 1-based) and jump to it.
  // Pauses while the prompt is open; resumes afterward unless already paused.
  function goToImage() {
    var wasPaused = isPaused;
    pause();
    var answer = window.prompt('Go to image number (1–' + images.length + '):', currentIndex + 1);
    var n = answer === null ? NaN : parseInt(answer, 10);
    if (!wasPaused) resume();
    if (n >= 1 && n <= images.length) {
      showImage(n - 1);
    } else if (answer !== null) {
      showActionToast('Enter a number from 1 to ' + images.length);
    }
  }

  // Ask for a display time (ms) for the current run only; the params file is
  // not changed (edit it on the Params page).
  function setDisplayTime() {
    var wasPaused = isPaused;
    pause();
    var answer = window.prompt('Display time (ms), this run only:', displayTimeMs);
    var ms = answer === null ? NaN : parseInt(answer, 10);
    if (ms >= 100) {
      displayTimeMs = ms;
      showActionToast('Display time ' + ms + ' ms');
    } else if (answer !== null) {
      showActionToast('Enter a number of 100 or more');
    }
    if (!wasPaused) resume();
  }

  function pause() {
    if (!isPaused) {
      isPaused = true;
      pauseIndicator.classList.add('visible');
      clearTimeout(timer);
    }
  }

  function resume() {
    if (isPaused) {
      isPaused = false;
      pauseIndicator.classList.remove('visible');
      scheduleNext();
    }
  }

  function togglePause() {
    if (isPaused) {
      resume();
    } else {
      pause();
    }
  }

  function openMenu() {
    if (isMenuOpen) return;
    isMenuOpen = true;
    menuOverlay.classList.add('visible');
    clearTimeout(timer);
    pause();
  }

  function closeMenu() {
    if (!isMenuOpen) return;
    isMenuOpen = false;
    menuOverlay.classList.remove('visible');
  }

  function toggleMenu() {
    if (isMenuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  // Show error message (styled by .error-* classes in styles.css)
  function showError(title, suggestion) {
    loadingEl.innerHTML = '<div class="error-box">' +
      '<div class="error-title">' + title + '</div>' +
      '<div class="error-detail">' + suggestion + '</div>' +
      '</div>';
  }

  // Handle image load error (e.g., SSD disconnected during slideshow)
  function handleImageError() {
    hasImageError = true;
    isErrorState = true;
    pause();
    currentImage.style.display = 'none';
    loadingEl.style.display = 'block';
    var parts = [];
    if (currentFotoId !== null) parts.push('img_id: ' + currentFotoId);
    if (currentPath) parts.push('Path: ' + currentPath);
    var detail = parts.length ? '<div class="error-meta">' + parts.join(' &nbsp;|&nbsp; ') + '</div>' : '';
    showError('Image failed to load' + detail,
      'Volume may be disconnected. Space to retry, ← → navigate, Esc for menu.');
  }

  // Handle successful image load
  function handleImageLoad() {
    if (hasImageError) {
      hasImageError = false;
      isErrorState = false;
      loadingEl.style.display = 'none';
      currentImage.style.display = 'block';
    }
  }

  // Retry loading current image after error
  function retryImage() {
    if (!hasImageError) return;
    loadingEl.innerHTML = 'Retrying...';
    var imagePath = '/images/' + images[currentIndex] + '?t=' + Date.now();
    currentImage.src = imagePath;
  }

  // Keyboard handler
  document.addEventListener('keydown', function (e) {
    // Notes form is open
    if (currentForm === 'notes') {
      var activeId = document.activeElement ? document.activeElement.id : '';
      var notesInputIds = ['notes-category', 'notes-rank'];
      if (notesInputIds.indexOf(activeId) !== -1) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeNotesForm();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          submitNote();
        }
        return;
      }
      // In the note textarea: Enter inserts newline (browser default); only Escape is intercepted
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNotesForm();
      }
      return;
    }

    // Prov form is open: Esc cancels; Enter saves except in the comment textarea
    if (currentForm === 'prov') {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeProvForm();
      } else if (e.key === 'Enter' && document.activeElement &&
          document.activeElement.tagName === 'INPUT') {
        e.preventDefault();
        submitProv();
      }
      return;
    }

    // Error state: Esc → Params page; Space → retry if image load error
    if (isErrorState) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (hasImageError) {
          hasImageError = false;
          isErrorState = false;
          loadingEl.style.display = 'none';
          openMenu();
        } else {
          window.location.href = '/params';
        }
      } else if (e.key === ' ' && hasImageError) {
        e.preventDefault();
        retryImage();
      } else if (e.key === 'ArrowRight' && hasImageError) {
        e.preventDefault();
        hasImageError = false;
        isErrorState = false;
        loadingEl.style.display = 'none';
        nextImage();
      } else if (e.key === 'ArrowLeft' && hasImageError) {
        e.preventDefault();
        hasImageError = false;
        isErrorState = false;
        loadingEl.style.display = 'none';
        prevImage();
      } else if (e.key === 'i' || e.key === 'I') {
        // Info/Notes stay available on the error box: the metadata is already
        // fetched, and a file that won't load is exactly one worth annotating.
        e.preventDefault();
        toggleInfo();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNotesForm();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        openProvForm();
      }
      return;
    }

    if (images.length === 0) return;

    // Menu is open
    if (isMenuOpen) {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          closeMenu();
          resume();
          break;
        case 'Escape':
          e.preventDefault();
          closeMenu();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          openNotesForm();
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          openProvForm();
          break;
        case 'g':
        case 'G':
          e.preventDefault();
          closeMenu();
          goToImage();
          break;
        case 't':
        case 'T':
          e.preventDefault();
          closeMenu();
          setDisplayTime();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          window.location.href = paramsUrl();
          break;
      }
      return;
    }

    // Normal slideshow keys
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (hasImageError) {
          retryImage();
        } else {
          togglePause();
        }
        break;
      case 'Escape':
        e.preventDefault();
        openMenu();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prevImage();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextImage();
        break;
      case 'i':
      case 'I':
        e.preventDefault();
        toggleInfo();
        break;
      case 'n':
      case 'N':
        e.preventDefault();
        openNotesForm();
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        openProvForm();
        break;
      case 'g':
      case 'G':
        e.preventDefault();
        goToImage();
        break;
      case 't':
      case 'T':
        e.preventDefault();
        setDisplayTime();
        break;
      case 'p':
      case 'P':
        e.preventDefault();
        window.location.href = paramsUrl();
        break;
    }
  });

  // Initialize
  async function init() {
    try {
      var data = await fetchImages();
      images = data.images;

      if (!urlParams.has('displayTimeMs')) {
        displayTimeMs = data.displayTimeMs;
      }

      // Startup error from server (e.g., missing files, bad DB path)
      if (data.errorInfo) {
        isErrorState = true;
        showError(data.errorInfo.error, data.errorInfo.suggestion);
        return;
      }

      if (images.length === 0) {
        isErrorState = true;
        showError('No images found', 'Check the settings in ' + (data.paramsFile || 'your params file') + ' and restart the server. Press Esc to open Params page.');
        return;
      }

      currentImage.addEventListener('error', handleImageError);
      currentImage.addEventListener('load', handleImageLoad);

      loadingEl.style.display = 'none';
      var startIndex = Math.min(currentIndex, images.length - 1);
      showImage(startIndex);
    } catch (error) {
      console.error('Failed to fetch images:', error);
      isErrorState = true;
      showError('Failed to load images', 'Check that the server is running. Press Esc to open Params page.');
    }
  }

  init();
})();
