<?php
/**
 * E-Tax Center — SMTP Test Script
 * Place this file in your Apache web root (e.g. C:\Apache24\htdocs\smtp-test.php)
 * Open in browser: http://localhost/smtp-test.php
 *
 * No external dependencies. Pure PHP sockets.
 * Shows every SMTP handshake step with pass/fail.
 */

function smtp_send_test(string $host, int $port, string $user, string $pass, string $from_str, string $to, string $subject): array {
    $log = [];

    $conn = @fsockopen($host, $port, $errno, $errstr, 10);
    if (!$conn) {
        $log[] = ['ok' => false, 'step' => 'Connect', 'msg' => "Cannot connect to {$host}:{$port} — {$errstr} (errno {$errno})"];
        return $log;
    }
    $log[] = ['ok' => true, 'step' => 'Connect', 'msg' => "Connected to {$host}:{$port}"];

    $read = function () use ($conn): string {
        $out = '';
        while (($line = fgets($conn, 1024)) !== false) {
            $out .= $line;
            if (strlen($line) >= 4 && $line[3] === ' ') break;
        }
        return rtrim($out);
    };

    $write = function (string $s) use ($conn): void {
        fputs($conn, $s . "\r\n");
    };

    $code = fn(string $r): string => substr(ltrim($r), 0, 3);

    $banner = $read();
    $log[] = ['ok' => true, 'step' => 'Banner', 'msg' => $banner];

    $write("EHLO smtp-test.local");
    $ehlo = $read();
    $log[] = ['ok' => true, 'step' => 'EHLO', 'msg' => $ehlo];

    if ($port === 587 || $port === 25) {
        $write("STARTTLS");
        $tls_r = $read();
        $tls_ok = $code($tls_r) === '220';
        $log[] = ['ok' => $tls_ok, 'step' => 'STARTTLS', 'msg' => $tls_r];
        if (!$tls_ok) { fclose($conn); return $log; }

        stream_set_blocking($conn, true);
        $tls_up = @stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        $tls_err = $tls_up ? 'TLS negotiation OK' : 'stream_socket_enable_crypto() returned false — certificate or TLS error';
        $log[] = ['ok' => (bool)$tls_up, 'step' => 'TLS Upgrade', 'msg' => $tls_err];
        if (!$tls_up) { fclose($conn); return $log; }

        $write("EHLO smtp-test.local");
        $ehlo2 = $read();
        $log[] = ['ok' => true, 'step' => 'EHLO (after TLS)', 'msg' => $ehlo2];
    }

    $write("AUTH LOGIN");
    $auth_r = $read();
    $auth_ok = $code($auth_r) === '334';
    $log[] = ['ok' => $auth_ok, 'step' => 'AUTH LOGIN', 'msg' => $auth_r];
    if (!$auth_ok) { fclose($conn); return $log; }

    $write(base64_encode($user));
    $user_r = $read();
    $user_ok = $code($user_r) === '334';
    $log[] = ['ok' => $user_ok, 'step' => 'AUTH Username', 'msg' => $user_r];
    if (!$user_ok) { fclose($conn); return $log; }

    $write(base64_encode($pass));
    $pass_r = $read();
    $pass_ok = $code($pass_r) === '235';
    $log[] = ['ok' => $pass_ok, 'step' => 'AUTH Password', 'msg' => $pass_r];
    if (!$pass_ok) { fclose($conn); return $log; }

    preg_match('/<(.+?)>/', $from_str, $m);
    $from_addr = $m[1] ?? $from_str;

    $write("MAIL FROM:<{$from_addr}>");
    $mf_r = $read();
    $mf_ok = $code($mf_r) === '250';
    $log[] = ['ok' => $mf_ok, 'step' => 'MAIL FROM', 'msg' => $mf_r];
    if (!$mf_ok) { fclose($conn); return $log; }

    $write("RCPT TO:<{$to}>");
    $rt_r = $read();
    $rt_ok = $code($rt_r) === '250';
    $log[] = ['ok' => $rt_ok, 'step' => 'RCPT TO', 'msg' => $rt_r];
    if (!$rt_ok) { fclose($conn); return $log; }

    $write("DATA");
    $data_r = $read();
    $data_ok = $code($data_r) === '354';
    $log[] = ['ok' => $data_ok, 'step' => 'DATA', 'msg' => $data_r];
    if (!$data_ok) { fclose($conn); return $log; }

    $date = date('r');
    $body_html = "<div style='font-family:sans-serif;padding:20px'>"
               . "<h2 style='color:#16a34a'>&#x2705; SMTP Test &#x2705;</h2>"
               . "<p>Host: {$host}:{$port}</p>"
               . "<p>From: {$from_str}</p>"
               . "<p>To: {$to}</p>"
               . "<p style='color:#64748b'>ส่งจาก E-Tax Center SMTP Test Script</p>"
               . "</div>";

    $message = "Date: {$date}\r\n"
             . "From: {$from_str}\r\n"
             . "To: {$to}\r\n"
             . "Subject: {$subject}\r\n"
             . "MIME-Version: 1.0\r\n"
             . "Content-Type: text/html; charset=UTF-8\r\n"
             . "\r\n"
             . $body_html;

    fputs($conn, $message . "\r\n.\r\n");
    $sent_r = $read();
    $sent_ok = $code($sent_r) === '250';
    $log[] = ['ok' => $sent_ok, 'step' => 'Message Queued', 'msg' => $sent_r];

    $write("QUIT");
    fclose($conn);
    return $log;
}

$log = [];
$submitted = false;
$vals = [
    'host'    => 'mail.etaxcenter.com',
    'port'    => '587',
    'user'    => 'info@etaxcenter.com',
    'pass'    => '',
    'from'    => 'E-Tax Center <info@etaxcenter.com>',
    'to'      => '',
    'subject' => 'SMTP Test — E-Tax Center',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submitted = true;
    foreach ($vals as $k => $_) {
        $vals[$k] = trim($_POST[$k] ?? '');
    }
    $log = smtp_send_test(
        $vals['host'], (int)$vals['port'],
        $vals['user'], $vals['pass'],
        $vals['from'], $vals['to'], $vals['subject']
    );
}

$last    = !empty($log) ? end($log) : null;
$success = $last && $last['ok'] && $last['step'] === 'Message Queued';
?>
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>E-Tax Center — SMTP Test</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f1f5f9;min-height:100vh;padding:24px 16px}
.wrap{max-width:660px;margin:0 auto}
.card{background:#fff;border-radius:14px;padding:32px;box-shadow:0 2px 16px rgba(0,0,0,.08);margin-bottom:24px}
h1{font-size:20px;color:#1e293b;margin-bottom:6px}
.subtitle{font-size:13px;color:#94a3b8;margin-bottom:24px}
label{display:block;font-size:12px;font-weight:700;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px}
input[type=text],input[type=password],input[type=email],input[type=number]{width:100%;padding:10px 13px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;color:#1e293b;transition:border .15s}
input:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
.field{margin-bottom:16px}
.row2{display:flex;gap:12px}
.row2 .field{flex:1}
button[type=submit]{background:#fb9678;color:#fff;border:none;padding:12px 32px;border-radius:9px;font-size:15px;font-weight:700;cursor:pointer;width:100%;margin-top:4px;letter-spacing:.3px;transition:background .15s}
button[type=submit]:hover{background:#f97316}
.banner{border-radius:10px;padding:14px 18px;font-size:14px;font-weight:600;margin-bottom:20px}
.banner.ok{background:#f0fdf4;border:1px solid #86efac;color:#15803d}
.banner.fail{background:#fef2f2;border:1px solid #fca5a5;color:#dc2626}
.log-card{background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 16px rgba(0,0,0,.08)}
.log-card h2{font-size:14px;color:#64748b;margin-bottom:16px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.step{display:flex;gap:12px;padding:10px 14px;border-radius:8px;margin-bottom:8px;font-size:13px;align-items:flex-start}
.step.ok{background:#f0fdf4;border-left:4px solid #22c55e}
.step.fail{background:#fef2f2;border-left:4px solid #ef4444}
.step-icon{font-size:14px;min-width:20px}
.step-name{font-weight:700;color:#334155;min-width:170px;flex-shrink:0}
.step-msg{color:#64748b;word-break:break-all;font-family:monospace;font-size:12px}
.note{font-size:12px;color:#94a3b8;margin-top:12px;line-height:1.6}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>🔧 E-Tax Center — SMTP Test</h1>
    <p class="subtitle">ทดสอบการเชื่อมต่อ SMTP ก่อน deploy — ไม่ต้องการ library ภายนอก</p>
    <form method="POST">
      <div class="field">
        <label>SMTP Host</label>
        <input type="text" name="host" value="<?= htmlspecialchars($vals['host']) ?>" required>
      </div>
      <div class="row2">
        <div class="field">
          <label>Port</label>
          <input type="number" name="port" value="<?= htmlspecialchars($vals['port']) ?>" required>
        </div>
      </div>
      <div class="field">
        <label>Username (Email)</label>
        <input type="text" name="user" value="<?= htmlspecialchars($vals['user']) ?>" required>
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="pass" value="<?= htmlspecialchars($vals['pass']) ?>">
      </div>
      <div class="field">
        <label>From (display name + email)</label>
        <input type="text" name="from" value="<?= htmlspecialchars($vals['from']) ?>" placeholder="E-Tax Center &lt;info@etaxcenter.com&gt;">
      </div>
      <div class="field">
        <label>To (test recipient email)</label>
        <input type="email" name="to" value="<?= htmlspecialchars($vals['to']) ?>" required>
      </div>
      <div class="field">
        <label>Subject</label>
        <input type="text" name="subject" value="<?= htmlspecialchars($vals['subject']) ?>">
      </div>
      <button type="submit">▶ Send Test Email</button>
    </form>
    <p class="note">
      Port 587 → uses STARTTLS (TLS upgrade after connect)<br>
      Port 465 → uses SSL/TLS from the start (change code if needed)<br>
      Certificate mismatch errors are <strong>ignored</strong> (same as Node.js config with <code>rejectUnauthorized: false</code>)
    </p>
  </div>

  <?php if ($submitted && !empty($log)): ?>
  <div class="log-card">
    <?php if ($success): ?>
      <div class="banner ok">✅ Email sent successfully! Check the inbox at <?= htmlspecialchars($vals['to']) ?></div>
    <?php else: ?>
      <div class="banner fail">❌ Failed at step: <strong><?= htmlspecialchars($last['step'] ?? '?') ?></strong></div>
    <?php endif; ?>
    <h2>SMTP Handshake Log</h2>
    <?php foreach ($log as $s): ?>
      <div class="step <?= $s['ok'] ? 'ok' : 'fail' ?>">
        <span class="step-icon"><?= $s['ok'] ? '✅' : '❌' ?></span>
        <span class="step-name"><?= htmlspecialchars($s['step']) ?></span>
        <span class="step-msg"><?= nl2br(htmlspecialchars($s['msg'])) ?></span>
      </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>
</body>
</html>
