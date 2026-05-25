<?php

$config = [];

// Database connection string (DSN) for PostgreSQL
$config['db_dsnw'] = 'pgsql://roundcube:roundcube_secure_pass@localhost/roundcube';

// Logging and Debugging
$config['log_dir'] = '/var/www/roundcube/logs/';
$config['temp_dir'] = '/var/www/roundcube/temp/';

// IMAP Server configuration
$config['default_host'] = 'localhost';
$config['default_port'] = 143;
$config['imap_auth_type'] = 'LOGIN';

// SMTP Server configuration
$config['smtp_server'] = 'localhost';
$config['smtp_port'] = 587;
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';
$config['smtp_auth_type'] = 'LOGIN';

// Session configuration
$config['session_lifetime'] = 30;

// Security and Product Info
$config['des_key'] = 'rcmail-!24ByteDESkey*Str';
$config['product_name'] = 'Superhost Webmail';

// Plugins
$config['plugins'] = ['archive', 'zipdownload'];

// UI
$config['skin'] = 'elastic';
$config['language'] = 'en_US';
