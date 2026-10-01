select substr(md5,20), substr(path,17) as spath, name, bytes
from fotos
where md5 in (
    select md5 from fotos group by md5 having count(*) > 1
)
order by md5, spath, name limit 32;


select count(*), substr(path,25,40) as spath
from fotos
where md5 in (
    select md5 from fotos group by md5 having count(*) > 1
)
group by spath
order by spath;