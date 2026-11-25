const XLSX=require('xlsx');
const rows=[
['Nr. crt.','Cod','Localitate','Adresa','Latitudine','Longitudine','Tip hidrant','Racord','Stare','Locatie aproximativa','Observatii','Coloana in plus'],
[1,'','timisoara','Str. Test 1',45.7550,21.2300,'subteran','B','func','','test zecimal','x'],
[2,'','Timișoara','Str. Test 2',`45°45'20.5"N`,`21°13'40.2"E`,'suprateran','racord C','nu merge','da','gms',''],
[3,'','Timișoara','Str. Test 3',479605.25,206585.84,'subteran','A','ok','','stereo70',''],
[4,'','Timișoara','Str. Test 4',21.2400,45.7600,'sub','B','verif. 2023','','inversat',''],
[5,'TM-0001','','','','','','','defect','','actualizare stare',''],
[6,'','Giroc','Lac de test',45.7000,21.2400,'lac','','functional','','sursa naturala',''],
[7,'','Timișoara','fara coordonate','','','subteran','B','ok','','',''],
[8,'TM 0001','Timișoara','dublura ID',45.7551,21.2301,'subteran','B','ok','','',''],
[9,'','Timișoara','departe',44.4,26.1,'subteran','B','ok','','',''],
[10,'','Timișoara','Str. Test 1 dublura',45.75501,21.23001,'subteran','B','','','',''],
];
const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Hidranti');
XLSX.writeFile(wb,__dirname+'/test-import.xlsx');console.log('ok');
