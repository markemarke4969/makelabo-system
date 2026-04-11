-- MARI 案件のコードを 'mari' に変更
update line_projects
  set code = 'mari'
  where name = 'MARI';

-- 確認
select id, name, code from line_projects where name = 'MARI';
