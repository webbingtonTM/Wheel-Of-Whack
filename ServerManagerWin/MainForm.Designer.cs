using System.Windows.Forms;

namespace WheelOfWackServerManager
{
    partial class MainForm
    {
        private System.ComponentModel.IContainer components = null!;
        private Label lblTitle;
        private Label lblStatusCap;
        private Label lblStatus;
        private Label lblPidCap;
        private Label lblPid;
        private Button btnStart;
        private Button btnStop;
        private Button btnRestart;
        private Button btnOpen;
        private Button btnBrowse;
        private NumericUpDown numPort;
        private Label lblPort;
        private TextBox txtRoot;
        private Label lblRoot;
        private System.Windows.Forms.Timer refreshTimer;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            lblTitle = new Label();
            lblStatusCap = new Label();
            lblStatus = new Label();
            lblPidCap = new Label();
            lblPid = new Label();
            btnStart = new Button();
            btnStop = new Button();
            btnRestart = new Button();
            btnOpen = new Button();
            numPort = new NumericUpDown();
            lblPort = new Label();
            txtRoot = new TextBox();
            lblRoot = new Label();
            refreshTimer = new System.Windows.Forms.Timer(components);
            ((System.ComponentModel.ISupportInitialize)numPort).BeginInit();
            SuspendLayout();

            lblTitle.AutoSize = true;
            lblTitle.Text = "Wheel of Wack — Server Manager";
            lblTitle.Font = new System.Drawing.Font("Segoe UI", 12F, System.Drawing.FontStyle.Bold);
            lblTitle.Location = new System.Drawing.Point(12, 9);

            lblStatusCap.AutoSize = true;
            lblStatusCap.Text = "Status:";
            lblStatusCap.Location = new System.Drawing.Point(12, 48);

            lblStatus.AutoSize = true;
            lblStatus.Text = "Not running";
            lblStatus.Location = new System.Drawing.Point(70, 48);

            lblPidCap.AutoSize = true;
            lblPidCap.Text = "PID:";
            lblPidCap.Location = new System.Drawing.Point(12, 70);

            lblPid.AutoSize = true;
            lblPid.Text = "-";
            lblPid.Location = new System.Drawing.Point(70, 70);

            lblPort.AutoSize = true;
            lblPort.Text = "Port:";
            lblPort.Location = new System.Drawing.Point(12, 100);

            numPort.Minimum = 1; numPort.Maximum = 65535; numPort.Value = 8080;
            numPort.Location = new System.Drawing.Point(70, 96);
            numPort.Width = 80;

            lblRoot.AutoSize = true;
            lblRoot.Text = "Root:";
            lblRoot.Location = new System.Drawing.Point(12, 130);

            txtRoot.Location = new System.Drawing.Point(70, 127);
            txtRoot.Width = 360; txtRoot.ReadOnly = true;

            btnBrowse = new Button();
            btnBrowse.Text = "Browse...";
            btnBrowse.Location = new System.Drawing.Point(440, 125);
            btnBrowse.Width = 80;
            btnBrowse.Click += btnBrowse_Click;

            btnStart.Text = "Start";
            btnStart.Location = new System.Drawing.Point(12, 170);
            btnStart.Click += btnStart_Click;

            btnStop.Text = "Stop";
            btnStop.Location = new System.Drawing.Point(92, 170);
            btnStop.Click += btnStop_Click;

            btnRestart.Text = "Restart";
            btnRestart.Location = new System.Drawing.Point(172, 170);
            btnRestart.Click += btnRestart_Click;

            btnOpen.Text = "Open Browser";
            btnOpen.Location = new System.Drawing.Point(252, 170);
            btnOpen.Click += btnOpen_Click;

            refreshTimer.Interval = 1500;
            refreshTimer.Tick += refreshTimer_Tick;

            ClientSize = new System.Drawing.Size(520, 220);
            Controls.Add(lblTitle);
            Controls.Add(lblStatusCap);
            Controls.Add(lblStatus);
            Controls.Add(lblPidCap);
            Controls.Add(lblPid);
            Controls.Add(lblPort);
            Controls.Add(numPort);
            Controls.Add(lblRoot);
            Controls.Add(txtRoot);
            Controls.Add(btnBrowse);
            Controls.Add(btnStart);
            Controls.Add(btnStop);
            Controls.Add(btnRestart);
            Controls.Add(btnOpen);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Wheel of Wack - Server Manager";
            ((System.ComponentModel.ISupportInitialize)numPort).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }
    }
}
