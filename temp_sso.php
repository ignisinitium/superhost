<?php
session_set_cookie_params(0, '/', '', true, true);
session_start();

if (isset($_GET['token'])) {
    $token = $_GET['token'];

    // Connect to PostgreSQL
    $conn = pg_connect("host=localhost dbname=superhost user=superhost password=superhost_pass");
    if (!$conn) {
        die("Database connection failed.");
    }

    $res = pg_query_params($conn, "SELECT username, created_at FROM sso_tokens WHERE token = $1 AND created_at > NOW() - INTERVAL '1 minute'", array($token));
    
    if ($row = pg_fetch_assoc($res)) {
        $username = $row['username'];
        
        // Delete token to ensure it's single use
        pg_query_params($conn, "DELETE FROM sso_tokens WHERE token = $1", array($token));
        
        // Authenticate phpMyAdmin as the master worker user
        $_SESSION['PMA_single_signon_user'] = 'superhost_worker';
        $_SESSION['PMA_single_signon_password'] = 'worker_db_pass';
        $_SESSION['PMA_single_signon_host'] = 'localhost';
        
        // Isolate databases (hide information_schema, performance_schema, mysql, etc)
        // and only show databases matching the username prefix
        $_SESSION['PMA_single_signon_cfg'] = array(
            'Servers' => array(
                1 => array(
                    'only_db' => array('^' . $username . '_.*')
                )
            )
        );

        header('Location: index.php');
        exit;
    } else {
        die("Invalid or expired token.");
    }
} else {
    header('Location: /client/databases');
    exit;
}
