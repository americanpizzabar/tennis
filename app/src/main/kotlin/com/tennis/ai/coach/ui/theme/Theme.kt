package com.tennis.ai.coach.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val CourtGreen = Color(0xFF1B5E20)
private val CourtGreenLight = Color(0xFF4CAF50)
private val CourtGreenDark = Color(0xFF003300)
private val BallYellow = Color(0xFFF9A825)
private val BallYellowDark = Color(0xFFF57F17)
private val AlertRed = Color(0xFFEF5350)
private val SurfaceDark = Color(0xFF121212)
private val SurfaceVariant = Color(0xFF1E1E1E)
private val OnSurface = Color(0xFFE0E0E0)

private val TennisDarkColorScheme = darkColorScheme(
    primary = CourtGreenLight,
    onPrimary = Color.White,
    primaryContainer = CourtGreenDark,
    onPrimaryContainer = Color(0xFFA5D6A7),
    secondary = BallYellow,
    onSecondary = Color.Black,
    secondaryContainer = BallYellowDark,
    onSecondaryContainer = Color.White,
    error = AlertRed,
    background = SurfaceDark,
    onBackground = OnSurface,
    surface = SurfaceVariant,
    onSurface = OnSurface,
    surfaceVariant = Color(0xFF2C2C2C),
    outline = Color(0xFF444444)
)

@Composable
fun TennisAITheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = TennisDarkColorScheme,
        content = content
    )
}
