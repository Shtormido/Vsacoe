using System;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Threading;

namespace JivieOboi.Lock;

/// <summary>Часы и дата поверх живых обоев — как на экране блокировки Windows 11.</summary>
internal sealed class ClockPanel : Grid
{
    readonly TextBlock time;
    readonly TextBlock date;
    readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromSeconds(1) };

    public ClockPanel()
    {
        IsHitTestVisible = false;
        RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        RowDefinitions.Add(new RowDefinition { Height = new GridLength(3, GridUnitType.Star) });

        var font = new FontFamily("Segoe UI Variable Display, Segoe UI");
        time = new TextBlock
        {
            FontFamily = font,
            FontSize = 120,
            FontWeight = FontWeights.SemiBold,
            Foreground = Brushes.White,
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        date = new TextBlock
        {
            FontFamily = font,
            FontSize = 28,
            Foreground = Brushes.White,
            HorizontalAlignment = HorizontalAlignment.Center,
        };

        var clock = new StackPanel { Effect = Shadow() };
        clock.Children.Add(time);
        clock.Children.Add(date);
        SetRow(clock, 1);
        Children.Add(clock);

        var hint = new TextBlock
        {
            Text = "Нажмите любую клавишу, щёлкните или подвигайте мышью",
            FontFamily = font,
            FontSize = 16,
            Foreground = new SolidColorBrush(Color.FromArgb(210, 255, 255, 255)),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 0, 48),
            Effect = Shadow(),
        };
        SetRow(hint, 2);
        Children.Add(hint);
        hint.BeginAnimation(OpacityProperty, new DoubleAnimation(1, 0, TimeSpan.FromSeconds(1.5))
        {
            BeginTime = TimeSpan.FromSeconds(5),
        });

        timer.Tick += (_, _) => Update();
        Loaded += (_, _) => { Update(); timer.Start(); };
        Unloaded += (_, _) => timer.Stop();
        Update();
    }

    static DropShadowEffect Shadow() => new() { BlurRadius = 18, ShadowDepth = 0, Opacity = 0.6, Color = Colors.Black };

    void Update()
    {
        var now = DateTime.Now;
        var culture = CultureInfo.CurrentCulture;
        time.Text = now.ToString("HH:mm", culture);
        var d = now.ToString("dddd, d MMMM", culture);
        date.Text = d.Length > 0 ? char.ToUpper(d[0], culture) + d[1..] : d;
    }
}
