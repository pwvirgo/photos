# photos

A local project for cataloging and curating a personal photo library.

## Modules

There are separate folders, called modules, with separate responsibilities, and no module trespasses on another's scope. Each is documented in its own README.md and operated from its own folder.

1) **dbase** module has definitions and routines to create and modify the db.

2) **collect** gathers images, exif data, and populates the db.

3) **slideshow** displays images, meta data, and allows the user to add comments and request changes to the images.

4) **curate** routines update the database and the image library.

5) **lib** contains TypeScript utilities currently used by slideshow and curate.

## Other folders
These are not part of the system and do NOT need to be reviewed by Claude unless requested.

**tools** instructions to port the project to another computer. Might need updates.

**philNotes** Phil is the person developing this project and he needs a place to save his thoughts.
