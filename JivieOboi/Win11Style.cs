using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using WF = System.Windows.Forms;

namespace JivieOboi;

/// <summary>Цвета меню по системной теме Windows 11 (тёмная/светлая) и акцентному цвету.</summary>
internal sealed class Win11Palette
{
    public bool Dark { get; }
    public Color Background { get; }
    public Color Hover { get; }
    public Color Text { get; }
    public Color DisabledText { get; }
    public Color Separator { get; }
    public Color Accent { get; }

    Win11Palette(bool dark, Color accent)
    {
        Dark = dark;
        Accent = accent;
        Background = dark ? Color.FromArgb(0x2C, 0x2C, 0x2C) : Color.FromArgb(0xF9, 0xF9, 0xF9);
        Hover = dark ? Color.FromArgb(0x3D, 0x3D, 0x3D) : Color.FromArgb(0xEA, 0xEA, 0xEA);
        Text = dark ? Color.White : Color.FromArgb(0x1A, 0x1A, 0x1A);
        DisabledText = dark ? Color.FromArgb(0x9A, 0x9A, 0x9A) : Color.FromArgb(0x8A, 0x8A, 0x8A);
        Separator = dark ? Color.FromArgb(0x45, 0x45, 0x45) : Color.FromArgb(0xE0, 0xE0, 0xE0);
    }

    /// <summary>Меню трея следует теме панели задач («Режим Windows»), а не приложений.</summary>
    public static Win11Palette Current()
    {
        bool dark = true;
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            if (key?.GetValue("SystemUsesLightTheme") is int light) dark = light == 0;
        }
        catch
        {
            // Оставляем тёмную тему — она по умолчанию у панели задач Windows 11.
        }

        var accent = dark ? Color.FromArgb(0x4C, 0xC2, 0xFF) : Color.FromArgb(0x00, 0x5F, 0xB8);
        try
        {
            var ui = new Windows.UI.ViewManagement.UISettings();
            var c = ui.GetColorValue(dark
                ? Windows.UI.ViewManagement.UIColorType.AccentLight2
                : Windows.UI.ViewManagement.UIColorType.AccentDark1);
            accent = Color.FromArgb(c.R, c.G, c.B);
        }
        catch
        {
            // UISettings недоступен — стандартный синий Windows 11.
        }
        return new Win11Palette(dark, accent);
    }
}

/// <summary>Отрисовка контекстного меню в духе Windows 11.</summary>
internal sealed class Win11MenuRenderer : WF.ToolStripProfessionalRenderer
{
    readonly Win11Palette p;

    public Win11MenuRenderer(Win11Palette palette) : base(new Colors(palette))
    {
        p = palette;
        RoundedEdges = true;
    }

    /// <summary>Применить стиль к меню и всем его подменю.</summary>
    public static void Apply(WF.ToolStripDropDown menu, Win11Palette palette)
    {
        menu.Renderer = new Win11MenuRenderer(palette);
        menu.BackColor = palette.Background;
        menu.ForeColor = palette.Text;
        menu.Padding = new WF.Padding(2, 4, 2, 4);
        if (menu is WF.ToolStripDropDownMenu ddm) ddm.ShowImageMargin = true;
        StyleWindow(menu, palette);
        foreach (WF.ToolStripItem item in menu.Items) StyleItem(item, palette);
    }

    static void StyleItem(WF.ToolStripItem item, Win11Palette palette)
    {
        item.ForeColor = palette.Text;
        if (item is not WF.ToolStripMenuItem mi) return;
        mi.Padding = new WF.Padding(4, 5, 4, 5);
        if (mi.DropDownItems.Count == 0) return;
        mi.DropDown.BackColor = palette.Background;
        mi.DropDown.Padding = new WF.Padding(2, 4, 2, 4);
        if (mi.DropDown is WF.ToolStripDropDownMenu dd) dd.ShowImageMargin = true;
        mi.DropDown.Renderer = new Win11MenuRenderer(palette);
        StyleWindow(mi.DropDown, palette);
        foreach (WF.ToolStripItem child in mi.DropDownItems) StyleItem(child, palette);
    }

    /// <summary>Скруглённые углы и тёмная рамка — силами DWM Windows 11.</summary>
    static void StyleWindow(WF.ToolStripDropDown dropDown, Win11Palette palette)
    {
        void Round()
        {
            Native.SetDwm(dropDown.Handle, Native.DWMWA_WINDOW_CORNER_PREFERENCE, Native.DWMWCP_ROUND);
            Native.SetDwm(dropDown.Handle, Native.DWMWA_USE_IMMERSIVE_DARK_MODE, palette.Dark ? 1 : 0);
        }
        if (dropDown.IsHandleCreated) Round();
        dropDown.HandleCreated += (_, _) => Round();
    }

    protected override void OnRenderToolStripBorder(WF.ToolStripRenderEventArgs e)
    {
        // Рамку и скругление рисует DWM.
    }

    protected override void OnRenderImageMargin(WF.ToolStripRenderEventArgs e)
    {
        using var b = new SolidBrush(p.Background);
        e.Graphics.FillRectangle(b, e.AffectedBounds);
    }

    protected override void OnRenderMenuItemBackground(WF.ToolStripItemRenderEventArgs e)
    {
        if (!e.Item.Selected || !e.Item.Enabled) return;
        var r = new Rectangle(4, 1, e.Item.Width - 8, e.Item.Height - 2);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = RoundRect(r, 4);
        using var b = new SolidBrush(p.Hover);
        e.Graphics.FillPath(b, path);
    }

    protected override void OnRenderItemText(WF.ToolStripItemTextRenderEventArgs e)
    {
        e.TextColor = e.Item.Enabled ? p.Text : p.DisabledText;
        base.OnRenderItemText(e);
    }

    protected override void OnRenderArrow(WF.ToolStripArrowRenderEventArgs e)
    {
        e.ArrowColor = p.Text;
        base.OnRenderArrow(e);
    }

    protected override void OnRenderItemCheck(WF.ToolStripItemImageRenderEventArgs e)
    {
        var r = e.ImageRectangle;
        float cx = r.Left + r.Width / 2f, cy = r.Top + r.Height / 2f, s = Math.Min(r.Width, r.Height) / 2.4f;
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(p.Accent, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        e.Graphics.DrawLines(pen, new[]
        {
            new PointF(cx - s, cy),
            new PointF(cx - s / 3, cy + s * 0.7f),
            new PointF(cx + s, cy - s * 0.7f),
        });
    }

    protected override void OnRenderSeparator(WF.ToolStripSeparatorRenderEventArgs e)
    {
        int y = e.Item.Height / 2;
        using var pen = new Pen(p.Separator);
        e.Graphics.DrawLine(pen, 8, y, e.Item.Width - 8, y);
    }

    static GraphicsPath RoundRect(Rectangle r, int radius)
    {
        int d = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(r.Left, r.Top, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Top, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    sealed class Colors : WF.ProfessionalColorTable
    {
        readonly Win11Palette p;
        public Colors(Win11Palette palette) { p = palette; UseSystemColors = false; }
        public override Color ToolStripDropDownBackground => p.Background;
        public override Color ImageMarginGradientBegin => p.Background;
        public override Color ImageMarginGradientMiddle => p.Background;
        public override Color ImageMarginGradientEnd => p.Background;
        public override Color MenuBorder => p.Separator;
        public override Color MenuItemBorder => Color.Transparent;
        public override Color MenuItemSelected => p.Hover;
        public override Color SeparatorDark => p.Separator;
        public override Color SeparatorLight => p.Separator;
    }
}

/// <summary>
/// «Режим эффективности» Windows 11 (зелёный листик в диспетчере задач):
/// пока обои на паузе, процесс получает EcoQoS и низкий приоритет.
/// </summary>
internal static class Efficiency
{
    static bool? current;

    public static void Set(bool enabled)
    {
        if (current == enabled) return;
        current = enabled;
        try
        {
            var state = new Native.PROCESS_POWER_THROTTLING_STATE
            {
                Version = 1,
                ControlMask = Native.PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
                StateMask = enabled ? Native.PROCESS_POWER_THROTTLING_EXECUTION_SPEED : 0,
            };
            Native.SetProcessInformation(Native.GetCurrentProcess(), Native.ProcessPowerThrottling,
                ref state, (uint)Marshal.SizeOf<Native.PROCESS_POWER_THROTTLING_STATE>());
            using var self = Process.GetCurrentProcess();
            self.PriorityClass = enabled ? ProcessPriorityClass.Idle : ProcessPriorityClass.Normal;
        }
        catch (Exception ex)
        {
            Log.Error("Режим эффективности", ex);
        }
    }
}
