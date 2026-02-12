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

        /*
         * STAGE 5: Deploy
         * Build the Docker image and start the API container.
         * This runs "docker compose up --build -d" which:
         *   1. Builds a new Docker image from the Dockerfile
         *   2. Stops the old container (if running)
         *   3. Starts a new container with the updated code
         *   4. The API will be available at http://localhost:3000
         */
        stage('Deploy') {
            steps {
                echo 'Deploying application...'
                sh 'docker compose -f docker-compose.app.yml up --build -d'
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
            sh '''
                curl --url 'smtp://sandbox.smtp.mailtrap.io:2525' \
                  --user '44c92abeb920f3:'"$MAILTRAP_PASSWORD"'' \
                  --mail-from 'jenkins@deploy-test.com' \
                  --mail-rcpt 'iigormazetti@hotmail.com' \
                  --upload-file - <<EOF
From: Jenkins <jenkins@deploy-test.com>
To: iigormazetti@hotmail.com
Subject: SUCCESS: Build completed successfully

The pipeline completed successfully.
All tests passed!
EOF
            '''
        }
        failure {
            echo '===================================='
            echo 'Pipeline FAILED! Check the logs above.'
            echo '===================================='
            sh '''
                curl --url 'smtp://sandbox.smtp.mailtrap.io:2525' \
                  --user '44c92abeb920f3:'"$MAILTRAP_PASSWORD"'' \
                  --mail-from 'jenkins@deploy-test.com' \
                  --mail-rcpt 'iigormazetti@hotmail.com' \
                  --upload-file - <<EOF
From: Jenkins <jenkins@deploy-test.com>
To: iigormazetti@hotmail.com
Subject: FAILURE: Build failed

The pipeline FAILED. Check the Jenkins logs for details.
EOF
            '''
        }
    }
}
