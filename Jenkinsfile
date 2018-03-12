#!groovy
@Library('ci-scripts') _

pipeline {
    agent {
        dockerfile { filename 'Dockerfile.ci' }
    }

    stages {
        stage('Dependencies') {

            steps {
                sh 'npm install'
                sh 'bower install'
            }

        }
        stage('Tests') {

            environment {
                CODECOV_TOKEN = '71724648-0254-4cd6-84b2-a7da9b2134ef'
            }

            steps {
                sh 'npm test'
            }

            post {
                always {
                    junit(testResults: "junit_results/*.xml", allowEmptyResults: true)
                    sh 'npm run codecov'
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
