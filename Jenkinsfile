#!groovy
@Library('ci-scripts') _

pipeline {
    agent any

    stages {
        stage('Dependencies') {
            steps {
                withDockerfile([:]) {
                    sh 'npm install'
                    sh 'bower install'
                }
            }

        }
        stage('Tests') {

            environment {
                CODECOV_TOKEN = '71724648-0254-4cd6-84b2-a7da9b2134ef'
            }

            steps {
                withDockerfile([:]) {
                    sh 'npm test'
                }
            }

            post {
                always {
                    junit(testResults: "junit_results/*.xml", allowEmptyResults: true)
                    withDockerfile([:]) {
                        sh 'npm run codecov'
                    }
                }
            }

        }

        stage('Deploy') {
            /*when {*/
                /*expression { env.BRANCH_NAME in ['master'] }*/
            /*}*/

            steps {
                withDockerfile([:]) {
                    sh 'npm run build'
                }

                withCredentials([string(credentialsId: 'npm-bringg', variable: 'NPM_TOKEN')]) {
                  dir('dist') {
                    publishNpm(token: env.NPM_TOKEN, public: true)
                  }
                }
            }
        }
    }

    post {
        always {
            slackBuildSummary()
        }
    }
}
