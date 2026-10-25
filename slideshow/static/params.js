// params.js — Params page
// Views and edits the slideshow params file. Edits take effect after a server
// restart; Exit offers to save them if changed.

(function() {
  var displayTimeMsInput = document.getElementById('displayTimeMs');
  var logLevelSelect = document.getElementById('logLevel');
  var paramsFileInput = document.getElementById('paramsFile');
  var sharedParamsFileInput = document.getElementById('sharedParamsFile');
  var dbDirInput = document.getElementById('dbDir');
  var dbNameInput = document.getElementById('dbName');
  var trashDirInput = document.getElementById('trashDir');
  var whereClauseInput = document.getElementById('whereClause');
  var orderByInput = document.getElementById('orderBy');
  var maxFilesInput = document.getElementById('maxFiles');
  var indexInput = document.getElementById('index');
  var statusEl = document.getElementById('status');
  var exitBtn = document.getElementById('exit-btn');
  var savePrompt = document.getElementById('save-prompt');
  var saveExitBtn = document.getElementById('save-exit-btn');
  var discardExitBtn = document.getElementById('discard-exit-btn');
  var cancelBtn = document.getElementById('cancel-btn');

  // Values of the editable fields, as last loaded or saved.
  var savedValues = null;

  function currentValues() {
    return JSON.stringify([
      parseInt(displayTimeMsInput.value) || 5000,
      logLevelSelect.value,
      whereClauseInput.value,
      orderByInput.value,
      parseInt(maxFilesInput.value) || 200,
    ]);
  }

  function isDirty() {
    return savedValues !== null && currentValues() !== savedValues;
  }

  // Preserve image index from incoming URL
  var urlParams = new URLSearchParams(window.location.search);
  indexInput.value = urlParams.get('index') || 0;

  // Load current param values
  async function loadParams() {
    try {
      var response = await fetch('/api/params');
      var params = await response.json();

      displayTimeMsInput.value = params.displayTimeMs;
      logLevelSelect.value = params.logLevel;
      paramsFileInput.value = params.paramsFile || '(unknown)';
      sharedParamsFileInput.value = params.sharedParamsFile || '(unknown)';
      dbDirInput.value = params.dbDir || '';
      dbNameInput.value = params.dbName || '';
      trashDirInput.value = params.trashDir || '';
      whereClauseInput.value = params.whereClause || '';
      orderByInput.value = params.orderBy || '';
      maxFilesInput.value = params.maxFiles || 200;
      savedValues = currentValues();
    } catch (error) {
      console.error('Failed to load params:', error);
    }
  }

  // Show status message
  function showStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + (isError ? 'error' : 'success');
    setTimeout(function() {
      statusEl.className = 'status';
    }, 5000);
  }

  // Save all params back to the file the server was started with.
  // Returns true on success.
  async function saveParams() {
    try {
      var response = await fetch('/api/params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayTimeMs: parseInt(displayTimeMsInput.value) || 5000,
          logLevel: logLevelSelect.value,
          whereClause: whereClauseInput.value,
          orderBy: orderByInput.value,
          maxFiles: parseInt(maxFilesInput.value) || 200,
        }),
      });
      if (response.ok) {
        savedValues = currentValues();
        return true;
      }
      var data = await response.json();
      showStatus(data.error || 'Failed to save', true);
    } catch (error) {
      showStatus('Failed to save', true);
    }
    return false;
  }

  // Return to the slideshow at the same image, keeping the display time it
  // arrived with (set by T for this run). The field on this page edits the
  // params file only, so it is not passed back.
  function leave() {
    var url = '/slides?index=' + (indexInput.value || 0);
    if (urlParams.has('displayTimeMs')) {
      url += '&displayTimeMs=' + encodeURIComponent(urlParams.get('displayTimeMs'));
    }
    window.location.href = url;
  }

  function closePrompt() {
    savePrompt.classList.remove('visible');
    exitBtn.focus();
  }

  // Exit goes straight back unless the saved-on-restart fields changed
  exitBtn.addEventListener('click', function() {
    if (!isDirty()) {
      leave();
      return;
    }
    savePrompt.classList.add('visible');
    saveExitBtn.focus();
  });

  saveExitBtn.addEventListener('click', async function() {
    if (await saveParams()) {
      leave();
    } else {
      closePrompt();
    }
  });

  discardExitBtn.addEventListener('click', leave);
  cancelBtn.addEventListener('click', closePrompt);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && savePrompt.classList.contains('visible')) {
      e.preventDefault();
      closePrompt();
    } else if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName === 'INPUT') {
      // Enter in a text field moves on to Exit
      e.preventDefault();
      exitBtn.focus();
    }
  });

  loadParams();
})();
