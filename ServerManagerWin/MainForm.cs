using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
// using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace WheelOfWackServerManager
{
    public partial class MainForm : Form
    {
        private Process? managedProc;
        private readonly string rootDir;
        private readonly string serverJs;
        private string repoRoot;
        private string serverJsPath;
        private readonly string pidFile;
        private readonly string rootHintFile;
        // private readonly HttpClient http = new HttpClient();

        public MainForm()
        {
            InitializeComponent();
            rootDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            rootHintFile = Path.Combine(rootDir, ".wack_server_root.txt");
            repoRoot = AutoDetectRoot() ?? rootDir;
            serverJsPath = Path.Combine(repoRoot, "server.js");
            pidFile = Path.Combine(repoRoot, ".wack_server.pid");
            txtRoot.Text = repoRoot;
            numPort.Value = 8080;
            // Avoid auto-detection on load to prevent any side effects
            // (no processes are started until Start is explicitly clicked)
            // _ = RefreshStatus();
            this.FormClosing += MainForm_FormClosing;
        }

        private async void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
        {
            await StopServer(force: true);
        }

        private string? AutoDetectRoot()
        {
            try
            {
                if (File.Exists(rootHintFile))
                {
                    var hint = File.ReadAllText(rootHintFile).Trim();
                    if (!string.IsNullOrWhiteSpace(hint) && File.Exists(Path.Combine(hint, "server.js")))
                        return hint;
                }
            }
            catch { }
            string? ProbeUp(string start)
            {
                try
                {
                    var dir = start;
                    for (int i = 0; i < 6 && !string.IsNullOrEmpty(dir); i++)
                    {
                        if (File.Exists(Path.Combine(dir, "server.js"))) return dir;
                        var parent = Directory.GetParent(dir);
                        if (parent == null) break; dir = parent.FullName;
                    }
                }
                catch { }
                return null;
            }
            return ProbeUp(rootDir) ?? ProbeUp(Environment.CurrentDirectory);
        }

        private void SaveRoot(string root)
        {
            try { File.WriteAllText(rootHintFile, root); } catch { }
        }

        private void btnBrowse_Click(object? sender, EventArgs e)
        {
            using var dlg = new FolderBrowserDialog();
            dlg.Description = "Select the folder that contains server.js";
            dlg.SelectedPath = txtRoot.Text;
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                var candidate = dlg.SelectedPath;
                if (!File.Exists(Path.Combine(candidate, "server.js")))
                {
                    MessageBox.Show("server.js not found in selected folder.");
                    return;
                }
                repoRoot = candidate;
                serverJsPath = Path.Combine(repoRoot, "server.js");
                txtRoot.Text = repoRoot;
                SaveRoot(repoRoot);
            }
        }

        private async void btnStart_Click(object sender, EventArgs e)
        {
            await StartServer();
        }

        private async void btnStop_Click(object sender, EventArgs e)
        {
            await StopServer(force: true);
        }

        private async void btnRestart_Click(object sender, EventArgs e)
        {
            await StopServer(force: true);
            await Task.Delay(200);
            await StartServer();
        }

        private async void btnOpen_Click(object sender, EventArgs e)
        {
            var url = $"http://localhost:{numPort.Value}/";
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
            await Task.CompletedTask;
        }

        private async void refreshTimer_Tick(object sender, EventArgs e)
        {
            await RefreshStatus();
        }

        private async Task StartServer()
        {
            if (!File.Exists(serverJsPath))
            {
                MessageBox.Show("server.js not found. Please click Browse and select the folder that contains server.js.");
                return;
            }
            if (managedProc != null && !managedProc.HasExited) return;
            // If something is already listening on the port, don't start another
            var existingPid = GetPidListeningOnPort((int)numPort.Value);
            if (existingPid != null)
            {
                try { managedProc = Process.GetProcessById(existingPid.Value); } catch { managedProc = null; }
                await RefreshStatus();
                return;
            }
            try
            {
                var psi = new ProcessStartInfo("node", "server.js")
                {
                    WorkingDirectory = Path.GetDirectoryName(serverJsPath)!,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                psi.Environment["PORT"] = ((int)numPort.Value).ToString();
                managedProc = Process.Start(psi);
                await Task.Delay(500);
                // Consolidate to the PID that actually owns the port
                var listeningPid = GetPidListeningOnPort((int)numPort.Value);
                if (listeningPid != null)
                {
                    Process? keep = null;
                    try { keep = Process.GetProcessById(listeningPid.Value); } catch { }
                    var procs = FindNodeServerProcesses();
                    foreach (var p in procs)
                    {
                        if (keep == null || p.Id != keep.Id)
                        {
                            try { p.Kill(); } catch { }
                        }
                    }
                    if (keep != null) managedProc = keep;
                }
                if (managedProc != null) File.WriteAllText(pidFile, managedProc.Id.ToString());
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to start server: " + ex.Message);
            }
            await RefreshStatus(delayMs: 200);
        }

        private async Task StopServer(bool force)
        {
            try
            {
                if (managedProc != null && !managedProc.HasExited)
                {
                    // Kill child node processes first (some environments spawn a child)
                    foreach (var child in FindChildNodeProcesses(managedProc.Id))
                    {
                        try { child.Kill(); } catch { }
                    }
                    try { managedProc.Kill(true); } catch { try { managedProc.Kill(); } catch { } }
                    managedProc.WaitForExit(2000);
                }
                managedProc = null;
                if (File.Exists(pidFile)) File.Delete(pidFile);

                // Also stop any node that is running server.js from our root
                foreach (var p in FindNodeServerProcesses())
                {
                    try { p.Kill(); } catch { }
                }
                // And any process still bound to the selected port
                var pidOnPort = GetPidListeningOnPort((int)numPort.Value);
                if (pidOnPort != null)
                {
                    try { Process.GetProcessById(pidOnPort.Value).Kill(); } catch { }
                }
                // As a final sweep, kill any node.exe whose command line includes this repo root
                foreach (var p in FindNodeProcessesByRoot(repoRoot))
                {
                    try { p.Kill(); } catch { }
                }
            }
            catch { }
            await RefreshStatus(delayMs: 200);
        }

        private async Task RefreshStatus(int delayMs = 0)
        {
            if (delayMs > 0) await Task.Delay(delayMs);

            var port = (int)numPort.Value;
            // var url = $"http://localhost:{port}/";
            string statusText = "Not running";
            string pidText = "-";
            bool running = false;
            // Check managed
            if (managedProc != null && !managedProc.HasExited)
            {
                running = true; statusText = "Running (managed)"; pidText = managedProc.Id.ToString();
            }
            else
            {
                // Check PID file
                if (File.Exists(pidFile))
                {
                    var txt = File.ReadAllText(pidFile);
                    if (int.TryParse(txt, out var pid))
                    {
                        try
                        {
                            var p = Process.GetProcessById(pid);
                            if (!p.HasExited) { running = true; statusText = "Running (managed PID)"; pidText = pid.ToString(); }
                        }
                        catch { }
                    }
                }
                // Try to find external node server.js
                if (!running)
                {
                    var list = FindNodeServerProcesses().ToList();
                    if (list.Any()) { running = true; statusText = "Running (external)"; pidText = string.Join(",", list.Select(p=>p.Id)); }
                }
                // Do not issue HTTP pings automatically; avoid on-demand services spawning a server.
            }

            lblStatus.Text = statusText;
            lblPid.Text = pidText;
            btnStart.Enabled = !running;
            btnStop.Enabled = running;
            btnRestart.Enabled = true;
        }

        private static bool CmdLineHas(Process p, string fragment)
        {
            try
            {
                using var searcher = new ManagementObjectSearcher($"SELECT CommandLine,ProcessId FROM Win32_Process WHERE ProcessId={p.Id}");
                foreach (ManagementObject @object in searcher.Get())
                {
                    var cmd = @object["CommandLine"]?.ToString() ?? string.Empty;
                    if (cmd.IndexOf(fragment, StringComparison.OrdinalIgnoreCase) >= 0) return true;
                }
            }
            catch { }
            return false;
        }

        private Process[] FindNodeServerProcesses()
        {
            try
            {
                var all = Process.GetProcessesByName("node");
                var nameOnly = "server.js";
                var full = serverJsPath.Replace("\\", "\\\\");
                return all.Where(p => CmdLineHas(p, nameOnly) || CmdLineHas(p, full)).ToArray();
            }
            catch { return Array.Empty<Process>(); }
        }

        private Process[] FindChildNodeProcesses(int parentPid)
        {
            try
            {
                var list = Process.GetProcessesByName("node");
                using var searcher = new ManagementObjectSearcher("SELECT ProcessId, ParentProcessId, CommandLine FROM Win32_Process WHERE Name='node.exe'");
                var map = searcher.Get()
                    .Cast<ManagementObject>()
                    .Select(mo => new
                    {
                        Pid = Convert.ToInt32(mo["ProcessId"]),
                        PPid = Convert.ToInt32(mo["ParentProcessId"]),
                        Cmd = (mo["CommandLine"]?.ToString() ?? string.Empty)
                    })
                    .Where(x => x.PPid == parentPid && x.Cmd.IndexOf("server.js", StringComparison.OrdinalIgnoreCase) >= 0)
                    .Select(x =>
                    {
                        try { return Process.GetProcessById(x.Pid); } catch { return null; }
                    })
                    .Where(p => p != null)
                    .ToArray();
                return map!
                    .Cast<Process>()
                    .ToArray();
            }
            catch { return Array.Empty<Process>(); }
        }

        private static DateTime SafeStartTime(Process p)
        {
            try { return p.StartTime; } catch { return DateTime.MinValue; }
        }

        private int? GetPidListeningOnPort(int port)
        {
            try
            {
                var psi = new ProcessStartInfo("netstat", "-ano")
                {
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using var p = Process.Start(psi);
                if (p == null) return null;
                var output = p.StandardOutput.ReadToEnd();
                p.WaitForExit(2000);
                var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var line in lines)
                {
                    var l = line.Trim();
                    if (!l.Contains("LISTENING", StringComparison.OrdinalIgnoreCase)) continue;
                    if (!Regex.IsMatch(l, $":{port}(\s|$)")) continue;
                    // tokens: Proto LocalAddress ForeignAddress State PID
                    var parts = Regex.Split(l, "\s+");
                    if (parts.Length < 5) continue;
                    var state = parts[3];
                    if (!state.Equals("LISTENING", StringComparison.OrdinalIgnoreCase)) continue;
                    if (int.TryParse(parts[^1], out var pid)) return pid;
                }
            }
            catch { }
            return null;
        }

        private Process[] FindNodeProcessesByRoot(string root)
        {
            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='node.exe'");
                var list = searcher.Get()
                    .Cast<ManagementObject>()
                    .Where(mo => ((mo["CommandLine"]?.ToString() ?? string.Empty)
                                  .IndexOf(root, StringComparison.OrdinalIgnoreCase) >= 0))
                    .Select(mo =>
                    {
                        try { return Process.GetProcessById(Convert.ToInt32(mo["ProcessId"])); } catch { return null; }
                    })
                    .Where(p => p != null)
                    .Cast<Process>()
                    .ToArray();
                return list;
            }
            catch { return Array.Empty<Process>(); }
        }
    }
}
