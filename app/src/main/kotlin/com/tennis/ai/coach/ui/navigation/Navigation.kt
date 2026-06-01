package com.tennis.ai.coach.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.tennis.ai.coach.ui.advisor.TacticalAdvisorScreen
import com.tennis.ai.coach.ui.analysis.VideoAnalysisScreen
import com.tennis.ai.coach.ui.home.HomeScreen
import com.tennis.ai.coach.ui.lesson.LessonDetailScreen
import com.tennis.ai.coach.ui.lesson.LessonListScreen
import com.tennis.ai.coach.ui.lesson.LessonRecordScreen
import com.tennis.ai.coach.ui.match.MatchScreen
import com.tennis.ai.coach.ui.peer.MultiPhoneScreen
import com.tennis.ai.coach.ui.profile.ProfileSetupScreen
import com.tennis.ai.coach.ui.report.MatchReportScreen

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
    object TacticalAdvisor : Screen("tactical_advisor")
    object MultiPhone : Screen("multi_phone")
    object LessonList : Screen("lesson_list")
    object LessonRecord : Screen("lesson_record")
    object LessonDetail : Screen("lesson_detail/{lessonId}") {
        fun route(lessonId: String) = "lesson_detail/$lessonId"
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
                },
                onOpenTacticalAdvisor = {
                    navController.navigate(Screen.TacticalAdvisor.route)
                },
                onOpenMultiPhone = {
                    navController.navigate(Screen.MultiPhone.route)
                },
                onOpenLessons = {
                    navController.navigate(Screen.LessonList.route)
                },
            )
        }

        composable(Screen.TacticalAdvisor.route) {
            TacticalAdvisorScreen(onBack = { navController.popBackStack() })
        }

        composable(Screen.MultiPhone.route) {
            MultiPhoneScreen(onBack = { navController.popBackStack() })
        }

        composable(Screen.LessonList.route) {
            LessonListScreen(
                onBack = { navController.popBackStack() },
                onNewLesson = { navController.navigate(Screen.LessonRecord.route) },
                onOpenLesson = { id -> navController.navigate(Screen.LessonDetail.route(id)) },
            )
        }

        composable(Screen.LessonRecord.route) {
            LessonRecordScreen(
                onBack = { navController.popBackStack() },
                onViewLesson = { id ->
                    navController.navigate(Screen.LessonDetail.route(id)) {
                        popUpTo(Screen.LessonList.route)
                    }
                },
            )
        }

        composable(
            Screen.LessonDetail.route,
            arguments = listOf(navArgument("lessonId") { type = NavType.StringType })
        ) { backStackEntry ->
            val lessonId = backStackEntry.arguments?.getString("lessonId") ?: ""
            LessonDetailScreen(lessonId = lessonId, onBack = { navController.popBackStack() })
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
