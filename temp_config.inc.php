<?php
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'signon';
$cfg['Servers'][$i]['SignonSession'] = 'PHPSESSID';
$cfg['Servers'][$i]['SignonURL'] = '/client/databases';
$cfg['Servers'][$i]['LogoutURL'] = '/client/databases';
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;

$cfg['blowfish_secret'] = 'o1d4h2d9g8j3k4l5m6n7p8q9r0s1t2u3vo1d4h2d9g8j3k4l5m6n7p8q9r0s1t2u3v';
$cfg['TempDir'] = '/tmp';
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
