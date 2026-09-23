// app.js — Slideshow viewer
// Responsibilities: fetch image list, display images, handle slideshow
// controls (pause, resume, next, prev, menu).
// In DB mode: menu shows Notes button to annotate images; data saved to the notes table.

(function app() {
  // DOM elements
  var currentImage = document.getElementById('current-image');
  var preloadImage = document.getElementById('preload-image');
  var loadingEl = document.getElementById('loading');
  var pauseIndicator = document.getElementById('pause-indicator');
  var menuOverlay = document.getElementById('menu-overlay');
  var notesBtn = document.getElementById('notes-btn');
  var resumeBtn = document.getElementById('resume-btn');
  var imageCounter = document.getElementById('image-counter');
  var paramsLink = document.getElementById('params-link');
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

  // Parse URL params
  var urlParams = new URLSearchParams(window.location.search);

  // State
  var images = [];
  var source = 'folder';
  var currentIndex = parseInt(urlParams.get('index')) || 0;
  var displayTimeMs = parseInt(urlParams.get('displayTimeMs')) || 5000;
  var isPaused = false;
  var isMenuOpen = false;
  var currentForm = null; // 'notes' or null
  var hasImageError = false;
  var isErrorState = false; // true on startup error; Escape → Control Panel
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
    var folder = urlParams.get('folder');
    var apiUrl = folder ? '/api/images?folder=' + encodeURIComponent(folder) : '/api/images';
    var response = await fetch(apiUrl);
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

  // DB mode: fetch the foto_id, name, path, dtCreated, and missing-on-disk
  // status for the current image index. Returns the parsed response (or
  // null on failure/non-db source) so callers can check `missing` before
  // loading the image itself — see docs/reconcile.md.
  async function fetchImageInfo(index) {
    if (source !== 'db') return null;
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
    if (source !== 'db' || !isInfoVisible) return;
    var kb = currentBytes !== null ? Math.round(currentBytes / 1024) + ' KB' : 'Unknown';
    infoOverlay.textContent =
      'IMG_ID: ' + (currentFotoId !== null ? currentFotoId : 'Unknown') +
        '   MD5: ' + (currentMd5 || 'Unknown') + '\n' +
      'Name: ' + (currentFilename || 'Unknown') + '\n' +
      'Camera: ' + (currentCamera || 'Unknown') + '\n' +
      'Path: ' + (currentPath || 'Unknown') + '\n' +
      'Taken: ' + (currentDtTaken || 'Unknown') + '  Created: ' + (currentDtCreated || 'Unknown') + '\n' +
      kb + (currentImgSize ? '  ' + currentImgSize : '') +
        (currentDuration ? '  ' + currentDuration : '');
  }

  function toggleInfo() {
    if (source !== 'db') return;
    isInfoVisible = !isInfoVisible;
    infoOverlay.classList.toggle('visible', isInfoVisible);
    updateInfoOverlay();
  }

  // Notes form
  function openNotesForm() {
    if (source !== 'db') return;
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
    if (source !== 'db' || currentFotoId === null) {
      notesMsg.textContent = 'No image selected';
      notesMsg.className = 'action-status error';
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

  // Notes form button handlers
  notesCancelBtn.addEventListener('click', function () {
    closeNotesForm();
  });

  notesSubmitBtn.addEventListener('click', function () {
    submitNote();
  });

  // Notes panel drag (translate from centered position)
  var isDragging = false;
  var dragStartX, dragStartY;
  var panelOffsetX = 0, panelOffsetY = 0;

  notesDragHandle.addEventListener('mousedown', function (e) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!isDragging) return;
    var dx = panelOffsetX + e.clientX - dragStartX;
    var dy = panelOffsetY + e.clientY - dragStartY;
    notesPanelEl.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
  });

  document.addEventListener('mouseup', function (e) {
    if (!isDragging) return;
    panelOffsetX += e.clientX - dragStartX;
    panelOffsetY += e.clientY - dragStartY;
    isDragging = false;
  });

  // Notes button in menu
  notesBtn.addEventListener('click', function () {
    openNotesForm();
  });

  // Menu resume button
  resumeBtn.addEventListener('click', function () {
    closeMenu();
    resume();
  });

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
    paramsLink.href = '/params?displayTimeMs=' + displayTimeMs + '&index=' + index;

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
    // Auto-focus first item for keyboard navigation
    setTimeout(function () {
      var items = getMenuFocusable();
      if (items.length > 0) items[0].focus();
    }, 0);
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

  // Menu keyboard navigation
  function getMenuFocusable() {
    var items = [];
    if (notesBtn && !notesBtn.hidden) items.push(notesBtn);
    if (resumeBtn) items.push(resumeBtn);
    if (paramsLink) items.push(paramsLink);
    return items;
  }

  function focusMenuNext() {
    var items = getMenuFocusable();
    if (items.length === 0) return;
    var idx = items.indexOf(document.activeElement);
    items[(idx + 1) % items.length].focus();
  }

  function focusMenuPrev() {
    var items = getMenuFocusable();
    if (items.length === 0) return;
    var idx = items.indexOf(document.activeElement);
    items[(idx - 1 + items.length) % items.length].focus();
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

    // Error state: Esc → Control Panel; Space → retry if image load error
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
      }
      return;
    }

    if (images.length === 0) return;

    // Menu is open
    if (isMenuOpen) {
      var menuItems = getMenuFocusable();
      var focused = document.activeElement;
      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) { focusMenuPrev(); } else { focusMenuNext(); }
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          focusMenuNext();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          focusMenuPrev();
          break;
        case ' ':
          e.preventDefault();
          if (menuItems.indexOf(focused) !== -1) {
            focused.click();
          } else {
            closeMenu();
            resume();
          }
          break;
        case 'Escape':
          e.preventDefault();
          closeMenu();
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
    }
  });

  // Initialize
  async function init() {
    try {
      var data = await fetchImages();
      images = data.images;
      source = data.source || 'folder';

      // Show Notes button in menu for DB mode
      if (source === 'db' && notesBtn) {
        notesBtn.hidden = false;
      }

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
        showError('No images found', 'Check the settings in ' + (data.paramsFile || 'your params file') + ' and restart the server. Press Esc to open Control Panel.');
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
      showError('Failed to load images', 'Check that the server is running. Press Esc to open Control Panel.');
    }
  }

  init();
})();
