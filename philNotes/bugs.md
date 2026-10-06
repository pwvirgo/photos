## params need to be rethought
currently each module has it's own params, but the name and location of the database should not vary by module.

the dataDir should be called dbDir

The lib should not need params!?!??  Things had been hardcoded - then I decided they should be params - and now I am wonder how the code id organized - should these params be arguments to functions?  (I've avoided reading that code)

## fix the menu
all options should be collected the same way - by a keystroke.  What about as a link also?  Only if the code is simple and easy to maintain.

## fix the url - or else
There should be a way for the user to jump to any image.  This is possible now by esc->settings and then the last param index=23 can be typed over when user resumes slideshow.

## curate/validate.ts
0) it does not check that every fotos.status='delete' is in the actions table.
1) is not in REAME - should be 1st in order of exec
2) It should print the count(*), status of fotos 1st.  Then do the fotos status check



- renaming the folder that holds the images (or the db) silently breaks every `fotos.path` — nothing errors, `curate/findMissing.ts` just starts reporting every image as missing.

The one-time fix is `UPDATE fotos SET path = replace(path, '<old>', '<new>')`, verify `still_old = 0`, then re-run `findMissing.ts` as a dry run to confirm 0 changes. Same situation applies when porting to another machine. Worth building a guard or a helper for this rather than relying on remembering the fix.

-  slideshow uses params imageFolderPath to display it in the control panel - but for no other reason

it should be removed from the params.json and the control panel 

-  curate routines use a guard against unmounted volumes but not against the wrong path on the same volume!  

It should be examined to check for a wrong path if it is a volume or not

One nuance worth adding to your note if you want precision: it's not really "wrong path on the same volume" specifically — it's any case where imageFolderPath still resolves fine but fotos.path values are stale or malformed (relative-path bug, folder rename, or a typo'd path). The volume being the same or different isn't really the distinguishing factor; whether the stored paths still match reality is.