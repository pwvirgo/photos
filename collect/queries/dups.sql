select substr(MD5,20), substr(path,17) as spath, name, bytes
from fotos
where MD5 in (
    select MD5 from fotos group by MD5 having count(*) > 1
)
order by MD5, spath, name limit 32;


select count(*), substr(path,25,40) as spath
from fotos
where MD5 in (
    select MD5 from fotos group by MD5 having count(*) > 1
)
group by spath
order by spath;