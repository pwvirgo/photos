select count(*), substr(path,40,55) as sp, status
from fotos
where (path like '%Drop%') or 
    (path like '%mages4/phxxtos%')
    AND fotos.status = 'ok'
group by sp, status
order by sp, status;
