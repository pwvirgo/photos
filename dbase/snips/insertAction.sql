select count(*) from fotos 
where img_id IN (select img_id from actions a where a.action='mv');


select * from actions  where action='mv' limit 3;

action_id  action  info                                                          request_dt           status_dt            status  img_id
---------  ------  ------------------------------------------------------------  -------------------  -------------------  ------  ------
3273       mv      /Users/mac24/a/projects/photos_now/images4/Dropbox_2021_imac  2026-10-14 23:07:04  2026-10-14 23:07:04  done    7052  
                   /Dropbox/2014 -> /Users/mac24/a/projects/photos_now/images4/                                                          
                   photos/2014          A


INSERT INTO actions (action, info, status_dt, status, img_id)
VALUES (
    'mv',
    '/Users/mac24/a/projects/photos_now/images4/macbook2012/Dropbox/Camera Uploads/2016-02-06 23.30.50.jpg -> /Users/mac24/a/projects/photos_now/images4/photos/2014',
    datetime('now'),
    'done',
    7052
);
