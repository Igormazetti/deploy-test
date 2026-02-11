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
        MAILTRAP_PASSWORD = credentials('mailtrap-password')
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
     */
    post {
        success {
            echo '===================================='
            echo 'Pipeline completed successfully!'
            echo '===================================='
            sh """
                curl --ssl-reqd \
                  --url 'smtps://sandbox.smtp.mailtrap.io:465' \
                  --user '44c92abeb920f3:${env.MAILTRAP_PASSWORD}' \
                  --mail-from 'jenkins@deploy-test.com' \
                  --mail-rcpt '${env.NOTIFY_EMAIL}' \
                  --header 'Subject: SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}' \
                  --header 'From: Jenkins <jenkins@deploy-test.com>' \
                  --header 'To: ${env.NOTIFY_EMAIL}' \
                  -F '=(;type=multipart/mixed' \
                  -F "=The pipeline completed successfully.\n\nJob: ${env.JOB_NAME}\nBuild: #${env.BUILD_NUMBER}\nURL: ${env.BUILD_URL};type=text/plain" \
                  -F '=)'
            """
        }
        failure {
            echo '===================================='
            echo 'Pipeline FAILED! Check the logs above.'
            echo '===================================='
            sh """
                curl --ssl-reqd \
                  --url 'smtps://sandbox.smtp.mailtrap.io:465' \
                  --user '44c92abeb920f3:${env.MAILTRAP_PASSWORD}' \
                  --mail-from 'jenkins@deploy-test.com' \
                  --mail-rcpt '${env.NOTIFY_EMAIL}' \
                  --header 'Subject: FAILURE: ${env.JOB_NAME} #${env.BUILD_NUMBER}' \
                  --header 'From: Jenkins <jenkins@deploy-test.com>' \
                  --header 'To: ${env.NOTIFY_EMAIL}' \
                  -F '=(;type=multipart/mixed' \
                  -F "=The pipeline FAILED.\n\nJob: ${env.JOB_NAME}\nBuild: #${env.BUILD_NUMBER}\nCheck the logs: ${env.BUILD_URL}console;type=text/plain" \
                  -F '=)'
            """
        }
    }
}
