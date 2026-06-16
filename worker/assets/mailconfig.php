<?php
// Mail client autoconfiguration responder. Serves Mozilla autoconfig
// (Thunderbird, GET) and Microsoft Autodiscover (Outlook, POST). The domain is
// derived from the Host header, so one file serves every hosted domain.
// Installed to /var/www/mailconfig/index.php by provisionMailconfigVhost.

$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
$domain = preg_replace('/^(autoconfig|autodiscover)\./', '', $host);
$mail = 'mail.' . $domain;
$uri = $_SERVER['REQUEST_URI'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$e = fn($s) => htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES, 'UTF-8');

header('Content-Type: application/xml; charset=utf-8');

$isAutodiscover = (stripos($uri, 'autodiscover') !== false) || $method === 'POST';

if ($isAutodiscover) {
  $email = '';
  $body = file_get_contents('php://input');
  if ($body && preg_match('#<EMailAddress>\s*([^<]+?)\s*</EMailAddress>#i', $body, $m)) {
    $email = trim($m[1]);
  }
  echo '<?xml version="1.0" encoding="utf-8"?>' . "\n";
  echo '<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">' . "\n";
  echo '  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">' . "\n";
  echo '    <Account>' . "\n";
  echo '      <AccountType>email</AccountType>' . "\n";
  echo '      <Action>settings</Action>' . "\n";
  echo '      <Protocol>' . "\n";
  echo '        <Type>IMAP</Type>' . "\n";
  echo '        <Server>' . $e($mail) . '</Server>' . "\n";
  echo '        <Port>993</Port>' . "\n";
  echo '        <DomainRequired>off</DomainRequired>' . "\n";
  echo '        <LoginName>' . $e($email) . '</LoginName>' . "\n";
  echo '        <SPA>off</SPA>' . "\n";
  echo '        <SSL>on</SSL>' . "\n";
  echo '        <AuthRequired>on</AuthRequired>' . "\n";
  echo '      </Protocol>' . "\n";
  echo '      <Protocol>' . "\n";
  echo '        <Type>SMTP</Type>' . "\n";
  echo '        <Server>' . $e($mail) . '</Server>' . "\n";
  echo '        <Port>587</Port>' . "\n";
  echo '        <DomainRequired>off</DomainRequired>' . "\n";
  echo '        <LoginName>' . $e($email) . '</LoginName>' . "\n";
  echo '        <SPA>off</SPA>' . "\n";
  echo '        <Encryption>TLS</Encryption>' . "\n";
  echo '        <AuthRequired>on</AuthRequired>' . "\n";
  echo '      </Protocol>' . "\n";
  echo '    </Account>' . "\n";
  echo '  </Response>' . "\n";
  echo '</Autodiscover>' . "\n";
} else {
  echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
  echo '<clientConfig version="1.1">' . "\n";
  echo '  <emailProvider id="' . $e($domain) . '">' . "\n";
  echo '    <domain>' . $e($domain) . '</domain>' . "\n";
  echo '    <displayName>' . $e($domain) . ' Mail</displayName>' . "\n";
  echo '    <displayShortName>' . $e($domain) . '</displayShortName>' . "\n";
  echo '    <incomingServer type="imap">' . "\n";
  echo '      <hostname>' . $e($mail) . '</hostname>' . "\n";
  echo '      <port>993</port>' . "\n";
  echo '      <socketType>SSL</socketType>' . "\n";
  echo '      <authentication>password-cleartext</authentication>' . "\n";
  echo '      <username>%EMAILADDRESS%</username>' . "\n";
  echo '    </incomingServer>' . "\n";
  echo '    <outgoingServer type="smtp">' . "\n";
  echo '      <hostname>' . $e($mail) . '</hostname>' . "\n";
  echo '      <port>587</port>' . "\n";
  echo '      <socketType>STARTTLS</socketType>' . "\n";
  echo '      <authentication>password-cleartext</authentication>' . "\n";
  echo '      <username>%EMAILADDRESS%</username>' . "\n";
  echo '    </outgoingServer>' . "\n";
  echo '  </emailProvider>' . "\n";
  echo '</clientConfig>' . "\n";
}
