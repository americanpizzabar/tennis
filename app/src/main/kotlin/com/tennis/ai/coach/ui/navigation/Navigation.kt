package com.tennis.ai.coach.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.tennis.ai.coach.ui.analysis.VideoAnalysisScreen
import com.tennis.ai.coach.ui.match.MatchScreen
import com.tennis.ai.coach.ui.profile.ProfileSetupScreen
import com.tennis.ai.coach.ui.report.MatchReportScreen
import com.tennis.ai.coach.ui.home.HomeScreen

sealed class Screen(val route: String) {
    object Home : Screen("home")
    object ProfileSetup : Screen("profile_setup?profileId={profileId}") {
        fun routeWithId(id: Long? = null) = if (id != null) "profile_setup?profileId=$id" else "profile_setup"
    }
    object Match : Screen("match/{matchType}") {
        fun route(matchType: String) = "match/$matchType"
    }
    object VideoAnalysis : Screen("video_analysis")
    object MatchReport : Screen("report/{matchId}") {
        fun route(matchId: String) = "report/$matchId"
    }
}

@Composable
fun TennisNavHost() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Screen.Home.route) {

        composable(Screen.Home.route) {
            HomeScreen(
                onStartMatch = { matchType ->
                    navController.navigate(Screen.Match.route(matchType))
                },
                onEditProfile = {
                    navController.navigate(Screen.ProfileSetup.routeWithId())
                },
                onVideoAnalysis = {
                    navController.navigate(Screen.VideoAnalysis.route)
                },
                onViewReport = { matchId ->
                    navController.navigate(Screen.MatchReport.route(matchId))
                }
            )
        }

        composable(
            Screen.ProfileSetup.route,
            arguments = listOf(navArgument("profileId") {
                type = NavType.LongType; defaultValue = -1L
            })
        ) {
            ProfileSetupScreen(onSaved = { navController.popBackStack() })
        }

        composable(
            Screen.Match.route,
            arguments = listOf(navArgument("matchType") { type = NavType.StringType })
        ) { backStackEntry ->
            val matchType = backStackEntry.arguments?.getString("matchType") ?: "SINGLES"
            MatchScreen(
                matchTypeStr = matchType,
                onMatchEnd = { matchId ->
                    navController.navigate(Screen.MatchReport.route(matchId)) {
                        popUpTo(Screen.Home.route)
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.VideoAnalysis.route) {
            VideoAnalysisScreen(onBack = { navController.popBackStack() })
        }

        composable(
            Screen.MatchReport.route,
            arguments = listOf(navArgument("matchId") { type = NavType.StringType })
        ) { backStackEntry ->
            val matchId = backStackEntry.arguments?.getString("matchId") ?: ""
            MatchReportScreen(
                matchId = matchId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
