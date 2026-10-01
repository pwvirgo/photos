- renaming the folder that holds the images (or the db) silently breaks every `fotos.path` — nothing errors, `curate/findMissing.ts` just starts reporting every image as missing.

The one-time fix is `UPDATE fotos SET path = replace(path, '<old>', '<new>')`, verify `still_old = 0`, then re-run `findMissing.ts` as a dry run to confirm 0 changes. Same situation applies when porting to another machine. Worth building a guard or a helper for this rather than relying on remembering the fix.

-  slideshow uses params imageFolderPath to display it in the control panel - but for no other reason

it should be removed from the params.json and the control panel 

-  curate routines use a guard against unmounted volumes but not against the wrong path on the same volume!  

It should be examined to check for a wrong path if it is a volume or not

One nuance worth adding to your note if you want precision: it's not really "wrong path on the same volume" specifically — it's any case where imageFolderPath still resolves fine but fotos.path values are stale or malformed (relative-path bug, folder rename, or a typo'd path). The volume being the same or different isn't really the distinguishing factor; whether the stored paths still match reality is.