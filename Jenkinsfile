/*
 * Jenkinsfile - Declarative Pipeline
 * ====================================
 * This file tells Jenkins HOW to build and test our project.
 * Jenkins reads this file automatically from the repository.
 *
 * A "pipeline" is a series of "stages" (steps) that run in order.
 * If any stage fails, the pipeline stops and reports a failure.
 *
 * STRUCTURE:
 *   pipeline {          --> The entire pipeline definition
 *     agent any         --> "Run this on any available Jenkins machine"
 *     stages {          --> Container for all stages
 *       stage('Name') { --> A single named step
 *         steps { ... } --> The actual commands to run
 *       }
 *     }
 *   }
 */

pipeline {
    // "agent any" means: run this pipeline on any available Jenkins executor.
    // In our local setup, there is only one executor (your own machine).
    agent any

    // Environment variables available to all stages.
    // Change NOTIFY_EMAIL to your actual email address.
    environment {
        NOTIFY_EMAIL = 'iigormazetti@hotmail.com' 
    }

    // "tools" lets Jenkins automatically use installed tools.
    // We need Node.js, which we will configure in Jenkins settings later.
    tools {
        nodejs 'NodeJS'  // This name must match what we configure in Jenkins
    }

    stages {

        /*
         * STAGE 1: Checkout
         * Pull the latest code from GitHub.
         */
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        /*
         * STAGE 2: Install Dependencies
         * Run "npm install" to download all packages listed in package.json.
         */
        stage('Install') {
            steps {
                echo 'Installing dependencies...'
                sh 'npm install'
            }
        }

        /*
         * STAGE 3: Build
         * Compile TypeScript to JavaScript using "npm run build" (which calls tsc).
         * If there are TypeScript errors, this stage will fail.
         */
        stage('Build') {
            steps {
                echo 'Building TypeScript project...'
                sh 'npm run build'
            }
        }

        /*
         * STAGE 4: Test
         * Run our tests to verify everything works.
         * If any test fails (process.exit(1)), this stage will fail.
         */
        stage('Test') {
            steps {
                echo 'Running tests...'
                sh 'npm test'
            }
        }
    }

    /*
     * POST section - runs AFTER all stages complete (or fail).
     * "success" runs only if everything passed.
     * "failure" runs only if something failed.
     * "always" runs no matter what.
     *
     * EMAIL SETUP REQUIRED IN JENKINS:
     *   Manage Jenkins → System → E-mail Notification (scroll to bottom)
     *   - SMTP server: smtp-mail.outlook.com
     *   - Check "Use SMTP Authentication"
     *   - Username: iigormazetti@hotmail.com
     *   - Password: your Outlook/Hotmail password (or app password if 2FA is enabled)
     *   - Check "Use TLS"
     *   - SMTP Port: 587
     *   - Reply-To: iigormazetti@hotmail.com
     *   - Test by clicking "Test configuration by sending test e-mail"
     */
    post {
        success {
            echo '===================================='
            echo 'Pipeline completed successfully!'
            echo '===================================='
            mail to: "${env.NOTIFY_EMAIL}",
                 subject: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                 body: "The pipeline completed successfully.\n\nJob: ${env.JOB_NAME}\nBuild: #${env.BUILD_NUMBER}\nURL: ${env.BUILD_URL}"
        }
        failure {
            echo '===================================='
            echo 'Pipeline FAILED! Check the logs above.'
            echo '===================================='
            mail to: "${env.NOTIFY_EMAIL}",
                 subject: "FAILURE: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                 body: "The pipeline FAILED.\n\nJob: ${env.JOB_NAME}\nBuild: #${env.BUILD_NUMBER}\nCheck the logs: ${env.BUILD_URL}console"
        }
    }
}
